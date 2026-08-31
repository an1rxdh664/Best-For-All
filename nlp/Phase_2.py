#!/usr/bin/env python3
"""
final.py — Combined and patched Geo-food pipeline with component normalization
and dish-aware menu/review/slug metrics.

Features:
 - Resilient Overpass queries (multiple endpoints + retries)
 - Google Places & Foursquare enrichment with retries
 - Aggregator scraping (Zomato/Swiggy) fast-mode
 - Playwright fallback for JS pages (optional)
 - Menu & price extraction, price estimation
 - Evidence objects per POI: {type, url, excerpt, confidence}
 - low_evidence enforcement when insufficient evidence
 - is_open_now boolean (from Google/Foursquare or parsed opening_hours vs user local datetime)
 - Expanded search only when truly needed (few/no strong matches)
 - Rating normalization across returned POIs
 - Deduplication of reviews
 - Dish-aware metrics from:
      * menu text
      * reviews
      * domain/slug matches
      * page/evidence text
 - Component-wise normalization (observed-max) before combining into final score
 - CLI with JSON file output (--out or interactive)
"""

import os
import re
import sys
import time
import math
import json
import logging
import socket
import argparse
import requests
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from requests.exceptions import RequestException
import warnings
warnings.filterwarnings('ignore')

# optional: zoneinfo
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

# optional: playwright
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    PLAYWRIGHT_AVAILABLE = False

# optional sentence-transformers (semantic)
try:
    from sentence_transformers import SentenceTransformer, util as st_util
    ST_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    HAS_ST = True
except Exception:
    ST_MODEL = None
    HAS_ST = False

# optional summarizer
try:
    from transformers import pipeline as hf_pipeline
    SUMMARIZER = hf_pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")
    HAS_SUMMARIZER = True
except Exception:
    SUMMARIZER = None
    HAS_SUMMARIZER = False

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

# ---------------- CONFIG ----------------
GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY") or "AIzaSyBFoL8jAGilROTcdLAXgYInHoYaRZXw3Hg"


FOURSQUARE_API_KEY = os.getenv("FOURSQUARE_API_KEY") or "fsq3ZW+ma0ksomWlYkZYUBMMs7jN3rgr1ZZ0k9DmyU1aL8U="


W_PREF = 0.30
W_RATING = 0.25
W_DIST = 0.15
W_TIME = 0.10
W_PRICE = 0.20

DEFAULT_RADIUS_M = 3000
MAX_OVERPASS_RETRIES = 3

AGGREGATOR_SCRAPING_ENABLED = True

# ---------------- HELPERS ----------------
def is_connected(host="8.8.8.8", port=53, timeout=3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False

def get_public_ip(api="http://ip-api.com/json/") -> Optional[Dict[str,Any]]:
    try:
        r = requests.get(api, timeout=6)
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "success":
            return data
        return None
    except Exception:
        return None

def get_local_time_and_period(geo: Optional[Dict[str,Any]] = None) -> Tuple[datetime, str, int]:
    dt = datetime.now()
    tzname = geo.get("timezone") if geo else None
    if tzname and ZoneInfo is not None:
        try:
            dt = datetime.now(ZoneInfo(tzname))
        except Exception:
            dt = datetime.now()
    h = dt.hour
    if 0 <= h < 6: return dt, "late_night", 1000
    if 6 <= h < 12: return dt, "morning", 3000
    if 12 <= h < 18: return dt, "afternoon", 3000
    return dt, "evening", 2000

# ---------------- DISH PARSING ----------------
def parse_dish_from_query(query: str) -> str:
    q = query.lower()
    q = re.sub(r'\b(?:under|below|less than|<=|<|up to|max(?:imum)?)\b\s*₹?\s*\d{1,5}\b', ' ', q)
    q = re.sub(r'\b\d{1,5}\s*(?:rs|inr|rupee|₹)\b', ' ', q)
    q = re.sub(r'\b\d{1,5}\b', ' ', q)
    q = re.sub(r'\([^)]*\)', ' ', q)
    q = re.sub(r'[^a-zA-Z0-9\s]', ' ', q)
    filler = [
        "nearest","near me","nearby","place","places","find","get","where","best","to","for","in",
        "town","city","with","have","has","show","i want","want","looking","looking for","please",
        "under","below","less","cheapest","cheap","price","rs","inr"
    ]
    for f in filler:
        q = re.sub(r'\b' + re.escape(f) + r'\b', ' ', q)
    q = re.sub(r'\s+', ' ', q).strip()
    parts = q.split()
    if not parts:
        return query.lower()
    meaningful = [p for p in parts if not re.search(r'\d', p) and len(p) > 1]
    if not meaningful:
        meaningful = parts
    dish = " ".join(meaningful[-3:]) if len(meaningful) >= 3 else " ".join(meaningful)
    return dish.strip()

DISH2FILTERS = {
    "coffee":[{"amenity":"cafe"},{"shop":"coffee"}],
    "tea":[{"amenity":"cafe"},{"shop":"tea"}],
    "burger":[{"amenity":"fast_food"},{"amenity":"restaurant"}],
    "pizza":[{"amenity":"restaurant"},{"amenity":"fast_food"}],
    "biryani":[{"amenity":"restaurant"}],
    "cheesecake":[{"shop":"bakery"},{"amenity":"cafe"}],
    "pastry":[{"shop":"bakery"},{"amenity":"cafe"}],
    "vegan":[{"amenity":"restaurant"},{"amenity":"cafe"}],
    "salad":[{"amenity":"restaurant"},{"shop":"juice"}],
    "default":[{"amenity":"restaurant"},{"amenity":"cafe"},{"amenity":"fast_food"},{"shop":"bakery"}]
}

DISH_KEYWORDS = {
    "biryani":["biryani","dum biryani","biriyani","hyderabadi biryani"],
    "burger":["burger","cheeseburger"],
    "cheesecake":["cheesecake","cheese cake"],
    "pastry":["pastry","croissant","danish"],
    "coffee":["coffee","espresso","americano","black coffee"],
    "pizza":["pizza","margherita"],
    "vegan":["vegan","plant-based"],
    "salad":["salad","fruit salad"]
}

def get_filters_and_keywords_for_dish(dish: str):
    d = dish.lower()
    for k in DISH2FILTERS:
        if k in d:
            return DISH2FILTERS[k], DISH_KEYWORDS.get(k, [d])
    return DISH2FILTERS["default"], [dish] + dish.split()

def get_synonyms(term: str, max_syn=6) -> List[str]:
    term = term.lower().strip()
    syns = set()
    try:
        import nltk
        from nltk.corpus import wordnet as wn
        for syn in wn.synsets(term):
            for l in syn.lemmas():
                w = l.name().replace('_',' ')
                if w != term:
                    syns.add(w)
                if len(syns) >= max_syn:
                    break
            if len(syns) >= max_syn:
                break
    except Exception:
        pass
    if not syns:
        parts = [p for p in term.split() if len(p) > 2 and not re.search(r'\d', p)]
        for p in parts:
            if p.endswith('s'): syns.add(p[:-1])
            else: syns.add(p + 's')
    cleaned = []
    for s in [term] + list(syns):
        s2 = s.strip()
        if not s2: continue
        if re.search(r'\d', s2): continue
        if len(s2) < 3: continue
        cleaned.append(s2)
    if cleaned and cleaned[0] != term:
        if term not in cleaned:
            cleaned.insert(0, term)
    return cleaned[:max_syn+1]

# ---------------- HTML & TEXT ----------------
def extract_text_from_html(html: str, max_chars=8000) -> str:
    if not html:
        return ""
    try:
        soup = BeautifulSoup(html, "html.parser")
        for t in soup(["script","style","noscript","svg","header","footer"]):
            t.decompose()
        s = soup.get_text(" ", strip=True)
        return re.sub(r'\s+', ' ', s)[:max_chars]
    except Exception:
        return ""

def find_evidence_from_text(text: str, keywords: List[str]) -> Optional[str]:
    if not text:
        return None
    sents = re.split(r'(?<=[\.\!?])\s+', text)
    for sent in sents:
        for kw in keywords:
            if kw.lower() in sent.lower() and len(sent.strip()) > 10:
                return sent.strip()
    for sent in sents:
        if len(sent.strip())>20:
            return sent.strip()
    return None

# ---------------- PRICE ----------------
PRICE_REGEXES = [
    r'₹\s*([0-9]{1,5})',
    r'rs\.?\s*\.?\s*([0-9]{1,5})',
    r'inr\s*([0-9]{1,5})',
    r'([0-9]{2,5})\s*rupee',
    r'([0-9]{2,5})\s*rs\b'
]

def extract_price_from_text(text: str) -> Optional[int]:
    if not text:
        return None
    t = text.lower()
    for rx in PRICE_REGEXES:
        m = re.search(rx, t, flags=re.IGNORECASE)
        if m:
            try:
                val = int(m.group(1))
                if 10 <= val <= 20000:
                    return val
            except Exception:
                continue
    m2 = re.search(r'(?:price|cost|costs|priced at)\s*[^\d]*([0-9]{2,5})', t)
    if m2:
        try:
            val = int(m2.group(1))
            if 10 <= val <= 20000:
                return val
        except Exception:
            pass
    return None

# ---------------- HAVERSINE ----------------
def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dl/2)**2
    return R * 2 * math.asin(math.sqrt(a))

# ---------------- OVERPASS ----------------
def overpass_query_places(lat: float, lon: float, radius_m: int = 3000, limit: int = 60,
                          place_filters: Optional[List[Dict[str,str]]] = None, max_retries:int=3) -> List[Dict[str,Any]]:
    if place_filters is None:
        place_filters = [{"amenity":"cafe"}, {"shop":"coffee"}]
    clauses = []
    for f in place_filters:
        for k,v in f.items():
            clauses.append(f'node["{k}"="{v}"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["{k}"="{v}"](around:{radius_m},{lat},{lon});')
    q = f"[out:json][timeout:25];(\n  " + "\n  ".join(clauses) + f"\n);\nout center {limit};"

    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]
    for ep in endpoints:
        attempt = 0
        wait = 1.0
        while attempt < max_retries:
            attempt += 1
            try:
                r = requests.post(ep, data={"data": q}, timeout=30)
                r.raise_for_status()
                data = r.json()
                results = []
                for el in data.get("elements", []):
                    lat_ = el.get("lat") or (el.get("center") or {}).get("lat")
                    lon_ = el.get("lon") or (el.get("center") or {}).get("lon")
                    results.append({
                        "id": el.get("id"),
                        "type": el.get("type"),
                        "lat": lat_,
                        "lon": lon_,
                        "tags": el.get("tags", {}),
                        "source":"osm"
                    })
                return results
            except RequestException as e:
                logging.warning(f"Overpass {ep} attempt {attempt} failed: {e}")
                time.sleep(wait)
                wait *= 2.0
            except Exception as e:
                logging.warning(f"Overpass unexpected error at {ep}: {e}")
                break
    logging.warning("All Overpass endpoints failed or returned no data.")
    return []

# ---------------- GOOGLE / FOURSQUARE ----------------
def search_google_places(lat: float, lon: float, radius_m: int, keyword: str, limit:int=20, fail_on_error: bool = False) -> List[Dict[str,Any]]:
    if not GOOGLE_PLACES_API_KEY:
        logging.debug("No GOOGLE_PLACES_API_KEY set; skipping Google Places search.")
        return []
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {"location":f"{lat},{lon}", "radius":radius_m, "keyword":keyword, "key":GOOGLE_PLACES_API_KEY}
    tries = 0
    while tries < 3:
        tries += 1
        try:
            r = requests.get(url, params=params, timeout=10)
            logging.debug(f"Google Nearby request URL: {r.url}")
            r.raise_for_status()
            data = r.json()
            status = data.get("status")
            if status not in (None, "OK", "ZERO_RESULTS"):
                logging.warning(f"Google Places search status={status} error_message={data.get('error_message')} params={params}")
                if status in ("OVER_QUERY_LIMIT", "RESOURCE_EXHAUSTED") and tries < 3:
                    time.sleep(1 + tries)
                    continue
                if fail_on_error:
                    raise RuntimeError(f"Google Places API error: {status} - {data.get('error_message')}")
                return []
            results = []
            for item in data.get("results", [])[:limit]:
                results.append({
                    "source":"google",
                    "place_id": item.get("place_id"),
                    "name": item.get("name"),
                    "lat": item.get("geometry",{}).get("location",{}).get("lat"),
                    "lon": item.get("geometry",{}).get("location",{}).get("lng"),
                    "vicinity": item.get("vicinity"),
                    "google_rating": item.get("rating"),
                    "google_user_ratings_total": item.get("user_ratings_total"),
                    "raw": item
                })
            return results
        except requests.HTTPError as e:
            logging.warning(f"Google Places HTTP error: {e}")
            if tries < 3:
                time.sleep(1)
                continue
            if fail_on_error:
                raise
            return []
        except Exception as e:
            logging.warning(f"Google Places search failed (attempt {tries}): {e}")
            if tries < 3:
                time.sleep(1)
                continue
            if fail_on_error:
                raise
            return []

def get_google_place_details(place_id: str, fail_on_error: bool=False) -> Dict[str,Any]:
    if not GOOGLE_PLACES_API_KEY or not place_id:
        return {}
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields":"name,formatted_address,formatted_phone_number,website,reviews,opening_hours,rating,user_ratings_total,price_level,url",
        "key":GOOGLE_PLACES_API_KEY
    }
    tries = 0
    while tries < 3:
        tries += 1
        try:
            r = requests.get(url, params=params, timeout=10)
            logging.debug(f"Google Details request URL: {r.url}")
            r.raise_for_status()
            j = r.json()
            status = j.get("status")
            if status not in (None, "OK", "ZERO_RESULTS"):
                logging.warning(f"Google Place details status={status} error_message={j.get('error_message')} for place_id={place_id}")
                if status in ("OVER_QUERY_LIMIT", "RESOURCE_EXHAUSTED") and tries < 3:
                    time.sleep(1 + tries)
                    continue
                if fail_on_error:
                    raise RuntimeError(f"Google Place details API error: {status} - {j.get('error_message')}")
                return {}
            data = j.get("result", {}) or {}
            return {
                "name": data.get("name"),
                "address": data.get("formatted_address"),
                "phone": data.get("formatted_phone_number"),
                "website": data.get("website"),
                "opening_hours": data.get("opening_hours",{}).get("weekday_text") or data.get("opening_hours"),
                "open_now": (data.get("opening_hours") or {}).get("open_now") if data.get("opening_hours") else None,
                "rating": data.get("rating"),
                "user_ratings_total": data.get("user_ratings_total"),
                "reviews": data.get("reviews", []),
                "price_level": data.get("price_level"),
                "url": data.get("url")
            }
        except Exception as e:
            logging.warning(f"Google Place details failed for {place_id} (attempt {tries}): {e}")
            if tries < 3:
                time.sleep(1)
                continue
            return {}
'''
def search_foursquare(lat: float, lon: float, radius_m: int, query: str, limit:int=20, fail_on_error: bool=False) -> List[Dict[str,Any]]:
    if not FOURSQUARE_API_KEY:
        return []
    url = "https://api.foursquare.com/v3/places/search"
    headers = {"Accept":"application/json", "Authorization": FOURSQUARE_API_KEY}
    params = {"ll": f"{lat},{lon}", "radius": radius_m, "query": query, "limit": limit}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=8)
        r.raise_for_status()
        data = r.json()
        res = []
        for item in data.get("results", []):
            ge = item.get("geocodes", {}).get("main", {})
            res.append({
                "source":"foursquare",
                "fsq_id": item.get("fsq_id"),
                "name": item.get("name"),
                "lat": ge.get("latitude"),
                "lon": ge.get("longitude"),
                "categories": item.get("categories", []),
                "address": item.get("location", {}).get("formatted_address"),
                "raw": item
            })
        return res
    except Exception as e:
        logging.warning(f"Foursquare search failed: {e}")
        if fail_on_error:
            raise
        return []
'''
'''
def get_foursquare_place_details(fsq_id: str) -> Dict[str,Any]:
    if not FOURSQUARE_API_KEY or not fsq_id:
        return {}
    url = f"https://api.foursquare.com/v3/places/{fsq_id}"
    headers = {"Accept":"application/json", "Authorization": FOURSQUARE_API_KEY}
    try:
        r = requests.get(url, headers=headers, timeout=8)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logging.warning(f"Foursquare details failed: {e}")
        return {}
'''
'''
def get_foursquare_place_tips(fsq_id: str, limit:int=5) -> List[Dict[str,Any]]:
    if not FOURSQUARE_API_KEY or not fsq_id:
        return []
    url = f"https://api.foursquare.com/v3/places/{fsq_id}/tips"
    headers = {"Accept":"application/json", "Authorization": FOURSQUARE_API_KEY}
    params = {"limit": limit}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=8)
        r.raise_for_status()
        data = r.json()
        tips = data.get("tips", []) if isinstance(data, dict) else []
        out = []
        for t in tips:
            out.append({
                "text": t.get("text"),
                "user": t.get("user", {}).get("name"),
                "created_at": t.get("created_at"),
                "likes": t.get("likes", 0)
            })
        return out
    except Exception as e:
        logging.warning(f"Foursquare tips failed: {e}")
        return []
'''
# ---------------- AGGREGATOR helpers ----------------
def fetch_page_html(url: str, timeout: int = 12) -> str:
    if not url:
        return ""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Rating-System-Bot)"}
        r = requests.get(url, timeout=timeout, headers=headers)
        r.raise_for_status()
        return r.text
    except Exception:
        return ""

def clean_menu_items(menu_items: List[str]) -> List[str]:
    cleaned: List[str] = []
    seen: set = set()
    EXCLUDE_KEYWORDS = ["privacy policy","terms","refund","login","subscribe","instagram","cookie","about us"]
    for line in menu_items:
        line = (line or "").strip()
        if len(line) < 3:
            continue
        low = line.lower()
        if any(b in low for b in EXCLUDE_KEYWORDS): continue
        if len(line) > 160: continue
        if low in seen: continue
        seen.add(low)
        cleaned.append(line)
    return cleaned

def extract_aggregator_links(soup: BeautifulSoup) -> Dict[str,List[str]]:
    links: Dict[str,List[str]] = {"zomato": [], "swiggy": []}
    hrefs_seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href in hrefs_seen: continue
        hrefs_seen.add(href)
        href_l = href.lower()
        if "zomato.com" in href_l:
            links["zomato"].append(href)
        elif "swiggy.com" in href_l:
            links["swiggy"].append(href)
    links["zomato"] = links["zomato"][:2]
    links["swiggy"] = links["swiggy"][:2]
    return links

def extract_menu_and_reviews_from_html(html: str) -> (List[str], bool, str, List[str], Dict[str,List[str]]):
    if not html:
        return [], False, "", [], {"zomato": [], "swiggy": []}
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script","style","noscript","svg"]):
        tag.decompose()
    full_text = soup.get_text(" ", strip=True)
    text_lower = full_text.lower()
    MENU_KEYWORDS = ["menu","food","drinks","coffee","price","₹","rs","zomato","swiggy","biryani","burger","pizza","cake","pastry","chocolate"]
    found_menu = any(k in text_lower for k in MENU_KEYWORDS)
    menu_items = []
    price_pattern = r"(₹\s?\d+|\d+\s?rs|\$\s?\d+)"
    candidates = soup.find_all(["h2","h3","h4","li","p","span","div"])
    for tag in candidates:
        line = tag.get_text(" ", strip=True)
        if len(line) < 3: continue
        line_l = line.lower()
        if any(k in line_l for k in MENU_KEYWORDS) or re.search(price_pattern, line_l):
            menu_items.append(line)
    menu_items = clean_menu_items(menu_items)
    html_reviews_guess = []
    for tag in soup.find_all(string=re.compile(r"(review|rating|customer|feedback)", re.I)):
        val = (tag or "").strip()
        if val:
            html_reviews_guess.append(val)
    aggregator_links = extract_aggregator_links(soup)
    return menu_items, found_menu, full_text, html_reviews_guess, aggregator_links

def fetch_aggregator_data(aggregator_links: Dict[str,List[str]]) -> (List[str], List[str]):
    all_menu: List[str] = []
    all_reviews: List[str] = []
    if not AGGREGATOR_SCRAPING_ENABLED:
        return all_menu, all_reviews
    for provider, urls in aggregator_links.items():
        for url in urls:
            try:
                html = fetch_page_html(url, timeout=12)
                if not html: continue
                m_items, _, _, revs, _ = extract_menu_and_reviews_from_html(html)
                all_menu.extend(m_items)
                all_reviews.extend(revs)
            except Exception as e:
                logging.warning(f"Aggregator fetch failed for {provider} ({url}): {e}")
                continue
    def dedupe(seq: List[str]) -> List[str]:
        seen = set(); out=[]
        for x in seq:
            x_s = (x or "").strip()
            if not x_s: continue
            if x_s in seen: continue
            seen.add(x_s); out.append(x_s)
        return out
    return dedupe(all_menu), dedupe(all_reviews)

def summarize_text(text: str) -> str:
    if not text or len(text) < 200:
        return (text[:200] + "...") if text else "Not enough content."
    if HAS_SUMMARIZER:
        try:
            out = SUMMARIZER(text, max_length=120, min_length=40, do_sample=False)
            return out[0]["summary_text"]
        except Exception:
            return text[:300] + "..."
    return text[:300] + "..."

# ---------------- EVIDENCE ----------------
def make_evidence_item(type_: str, url: Optional[str], excerpt: Optional[str], confidence: float) -> Dict[str,Any]:
    return {
        "type": type_,
        "url": url,
        "excerpt": (excerpt or "")[:1000],
        "confidence": round(max(0.0, min(1.0, float(confidence))), 3)
    }

# ---------------- DEDUPE & MERGE ----------------
def _normalize_name(n: str) -> str:
    return re.sub(r'\W+', ' ', (n or "").lower()).strip()

def dedupe_and_merge_results(osm_results: List[Dict], google_results: List[Dict], dedupe_radius_m:int=60):
    unified = []
    for o in osm_results:
        entry = dict(o)
        entry.setdefault("sources", [])
        entry["sources"].append("osm")
        entry.setdefault("reviews", [])
        entry.setdefault("source", "osm")
        unified.append(entry)
    def find_match(lat, lon, name):
        for idx,e in enumerate(unified):
            if e.get("lat") is None or lat is None: continue
            d = haversine_km(lat, lon, e.get("lat"), e.get("lon"))*1000.0
            if d <= dedupe_radius_m:
                if _normalize_name(name) and _normalize_name(e.get("name","")):
                    if _normalize_name(name) in _normalize_name(e.get("name","")) or _normalize_name(e.get("name","")) in _normalize_name(name):
                        return idx
                else:
                    return idx
        return None
    for g in google_results:
        idx = find_match(g.get("lat"), g.get("lon"), g.get("name"))
        review_list=[]
        if "details" in g and isinstance(g["details"], dict):
            for r in g["details"].get("reviews",[]):
                review_list.append({"source":"google","author": r.get("author_name"), "rating": r.get("rating"), "text": r.get("text")})
        if idx is not None:
            unified[idx].setdefault("reviews",[]).extend(review_list)
            unified[idx].setdefault("sources",[]).append("google")
            unified[idx].setdefault("source","osm+google")
            if g.get("google_rating"):
                unified[idx]["google_rating"] = g.get("google_rating")
            if g.get("google_user_ratings_total"):
                unified[idx]["google_user_ratings_total"] = g.get("google_user_ratings_total")
            if g.get("price_est"):
                unified[idx]["price_est"]=g.get("price_est")
                unified[idx].setdefault("price_sources", []).extend(g.get("price_sources",[]))
            unified[idx].setdefault("details",{}).update(g.get("details",{}))
            unified[idx].setdefault("evidence_list",[]).extend(g.get("evidence_list",[]))
        else:
            new = {
                "id": g.get("place_id"),
                "type":"google_place",
                "name": g.get("name"),
                "lat": g.get("lat"),
                "lon": g.get("lon"),
                "tags": {},
                "website": g.get("details",{}).get("website") if g.get("details") else None,
                "source_url": g.get("details",{}).get("url") if g.get("details") else None,
                "snippet": g.get("vicinity"),
                "summary": "",
                "distance_km": None,
                "final_score": g.get("google_rating",0) or 0,
                "reviews": review_list,
                "sources": ["google"],
                "source": "google",
                "details": g.get("details", {}),
                "evidence_list": g.get("evidence_list", []) if g.get("evidence_list") else []
            }
            if g.get("price_est"):
                new["price_est"]=g.get("price_est")
                new["price_sources"]=g.get("price_sources",[])
            unified.append(new)
    return unified

# ---------------- SCORING ----------------
def detect_dish_presence_keyword(text: str, keywords: List[str]) -> int:
    if not text: return 0
    t = text.lower()
    count = 0
    for kw in keywords:
        if kw.lower() in t:
            count += 1
    return count

def score_text_simple(text: str, query: str) -> float:
    if not text: return 0.0
    t = text.lower()
    score = 0.0
    for w in query.lower().split():
        if w and w in t:
            score += 0.5
    score += min(len(t)/1000.0, 1.0) * 0.5
    for w in ["menu","price","serves","offers","order","espresso","burger","pizza","biryani","special","cake","pastry","chocolate"]:
        if w in t:
            score += 0.05
    return score

def normalize_rating_0_1(rating: Optional[float], scale_max: float = 5.0) -> float:
    try:
        if rating is None: return 0.0
        r = float(rating)
        return max(0.0, min(1.0, r / float(scale_max)))
    except Exception:
        return 0.0

# ---- dish-aware menu / review / slug metrics ----
def _keyword_hit_count(text: str, keywords: List[str]) -> int:
    if not text:
        return 0
    t = text.lower()
    c = 0
    for kw in keywords:
        kwl = kw.lower().strip()
        if not kwl:
            continue
        if kwl in t:
            c += 1
    return c

def compute_dish_match_metrics(entry: Dict[str,Any], dish_keywords: List[str], dish: str) -> Dict[str,Any]:
    """
    Compute how strongly this place is about the requested dish (biryani, coffee, pastry, etc)
    using:
      - domain/slug (website / source_url / evidence URLs)
      - menu items (menu_items + aggregator menu)
      - reviews (reviews + extra_reviews)
      - other page/evidence text
    """
    dish = (dish or "").strip().lower()
    kw_set = [dish] if dish else []
    for k in dish_keywords or []:
        k = (k or "").strip().lower()
        if k and k not in kw_set:
            kw_set.append(k)
    kw_set = [k for k in kw_set if k]

    if not kw_set:
        return {
            "domain_hits": 0,
            "menu_hits": 0,
            "review_hits": 0,
            "page_hits": 0,
            "domain_score": 0.0,
            "menu_score": 0.0,
            "review_score": 0.0,
            "page_score": 0.0,
            "total_score": 0.0,
        }

    # 1) domain / slug (website, source_url, evidence URLs)
    urls = set()
    for key in ("website","source_url"):
        u = entry.get(key)
        if u:
            urls.add(u)
    for ev in (entry.get("evidence_list") or []):
        if isinstance(ev, dict):
            u = ev.get("url")
            if u:
                urls.add(u)

    domain_hits = 0
    for u in urls:
        try:
            parsed = urlparse(u)
            host = parsed.netloc.lower()
            path = parsed.path.lower()
            text = host + " " + path
            domain_hits += _keyword_hit_count(text, kw_set)
        except Exception:
            continue
    domain_score = 1.0 if domain_hits > 0 else 0.0

    # 2) menu items (OSM menu_texts + Zomato/Swiggy + other menus)
    menu_hits = 0
    menu_items = entry.get("menu_items") or []
    for line in menu_items:
        menu_hits += _keyword_hit_count(line, kw_set)
    # scale: 0..1; 3+ hits saturate
    menu_score = min(menu_hits / 3.0, 1.0) if menu_hits > 0 else 0.0

    # 3) reviews (google/foursquare/aggregator)
    review_hits = 0
    for rv in (entry.get("reviews") or []):
        txt = (rv.get("text") if isinstance(rv, dict) else str(rv)) or ""
        review_hits += _keyword_hit_count(txt, kw_set)
    for txt in (entry.get("extra_reviews") or []):
        review_hits += _keyword_hit_count(txt, kw_set)
    review_score = min(review_hits / 5.0, 1.0) if review_hits > 0 else 0.0

    # 4) page text: snippet + summary + evidence excerpts
    page_hits = 0
    snippet = entry.get("snippet") or ""
    summary = entry.get("summary") or ""
    page_hits += _keyword_hit_count(snippet, kw_set)
    page_hits += _keyword_hit_count(summary, kw_set)
    for ev in (entry.get("evidence_list") or []):
        if isinstance(ev, dict):
            page_hits += _keyword_hit_count(ev.get("excerpt",""), kw_set)
    page_score = min(page_hits / 5.0, 1.0) if page_hits > 0 else 0.0

    # weighted total score
    total = (0.35 * menu_score) + (0.35 * review_score) + (0.20 * domain_score) + (0.10 * page_score)
    total = max(0.0, min(1.0, total))

    return {
        "keywords_used": kw_set,
        "domain_hits": int(domain_hits),
        "menu_hits": int(menu_hits),
        "review_hits": int(review_hits),
        "page_hits": int(page_hits),
        "domain_score": round(domain_score, 4),
        "menu_score": round(menu_score, 4),
        "review_score": round(review_score, 4),
        "page_score": round(page_score, 4),
        "total_score": round(total, 4),
    }

def compute_final_score_for_entry(
    e: Dict[str,Any],
    query_keywords: List[str],
    user_lat: float,
    user_lon: float,
    budget_inr: Optional[float]=None,
    dish: Optional[str]=None
) -> float:
    text = (e.get("snippet") or "") + "\n" + (e.get("summary") or "")
    kw_count = detect_dish_presence_keyword(text, query_keywords)
    pref_raw = score_text_simple(text, " ".join(query_keywords)) + (kw_count * 0.5)

    pref_sem = 0.0
    if HAS_ST and (text.strip()):
        try:
            chunks = re.split(r'(?<=[\.\?\!])\s+', text)
            chunks = [c for c in chunks if len(c.strip())>30]
            if not chunks:
                chunks = [text]
            chunk_embs = ST_MODEL.encode(chunks, convert_to_tensor=True)
            key_embs = ST_MODEL.encode(query_keywords, convert_to_tensor=True)
            sims = st_util.cos_sim(key_embs, chunk_embs)
            pref_sem = float(sims.max()) if sims.numel() else 0.0
        except Exception:
            pref_sem = 0.0

    # base preference score (text + semantic)
    pref_combined = pref_sem * 0.7 + min(pref_raw / 5.0, 1.0) * 0.3 if HAS_ST else min(pref_raw / 5.0, 1.0)
    preference_score = max(0.0, min(1.0, float(pref_combined)))

    # dish-aware metric from menu/reviews/domain/evidence
    dm = 0.0
    if e.get("dish_match_metrics"):
        try:
            dm = float(e["dish_match_metrics"].get("total_score", 0.0))
        except Exception:
            dm = 0.0
    # blend: give 30% weight to dish_match_metrics, 70% to text/semantic
    preference_score = max(0.0, min(1.0, (0.7 * preference_score) + (0.3 * dm)))

    rating = e.get("google_rating") or e.get("rating") or (e.get("details",{}) or {}).get("rating")
    rating_score = normalize_rating_0_1(rating)

    is_open = e.get("is_open_now")
    if is_open is True:
        time_score = 1.0
    elif is_open is False:
        time_score = 0.0
    else:
        time_score = 0.5

    dist_km = e.get("distance_km")
    if dist_km is None:
        distance_score = 0.5
    else:
        distance_score = max(0.0, min(1.0, 1.0 - min(dist_km / 8.0, 1.0)))

    price_est = e.get("price_est")
    if budget_inr is None:
        price_score = 0.5
    else:
        if price_est is None:
            price_score = 0.5
        else:
            if price_est <= budget_inr:
                price_score = 1.0
            else:
                ratio = (price_est - budget_inr) / (budget_inr if budget_inr>0 else 1)
                price_score = max(0.0, 1.0 - min(ratio, 1.0))

    raw = (preference_score * W_PREF) + (rating_score * W_RATING) + (distance_score * W_DIST) + (time_score * W_TIME) + (price_score * W_PRICE)

    e.setdefault("score_components", {})
    e["score_components"].update({
        "preference_score": round(preference_score, 4),
        "rating_score": round(rating_score, 4),
        "distance_score": round(distance_score, 4),
        "time_score": round(time_score, 4),
        "price_score": round(price_score, 4),
        "dish_match_score": round(dm, 4),
        "weights": {"preference": W_PREF, "rating": W_RATING, "distance": W_DIST, "time": W_TIME, "price": W_PRICE}
    })

    return float(raw)

def normalize_scores(unified: List[Dict[str,Any]], min_scale=0.0, max_scale=1.0) -> None:
    raw_scores = [u.get("final_score_raw", 0.0) for u in unified]
    if not raw_scores:
        return
    min_r = min(raw_scores); max_r = max(raw_scores)
    rng = max_r - min_r if max_r != min_r else 1.0
    for u in unified:
        raw = u.get("final_score_raw", 0.0)
        norm = (raw - min_r) / rng
        norm = max(0.0, min(1.0, norm))
        u["final_score"] = round(float(min_scale + norm * (max_scale - min_scale)), 4)

# ---------------- FALLBACK ----------------
def quick_google_or_fsq_fallback(lat, lon, radius_m, dish, dish_keywords, max_results=20):
    """
    Google-only fallback now (Foursquare removed).
    """
    candidates = []
    if GOOGLE_PLACES_API_KEY:
        try:
            gres = search_google_places(lat, lon, radius_m, dish, limit=max_results)
            for g in gres:
                if g.get("place_id"):
                    g["details"] = get_google_place_details(g.get("place_id"))
                g.setdefault("evidence_list", [])
                if g.get("details",{}).get("reviews"):
                    for rv in g["details"].get("reviews")[:3]:
                        if rv.get("text"):
                            g["evidence_list"].append(rv.get("text"))
                g.setdefault("price_sources", [])
                if g.get("details",{}).get("price_level") is not None:
                    try:
                        lvl = int(g["details"].get("price_level"))
                        mapping = {1:150, 2:300, 3:525, 4:900}
                        g["price_est"] = mapping.get(lvl)
                        g["price_sources"].append("google_price_level")
                    except Exception:
                        pass
                candidates.append({
                    "id": g.get("place_id"),
                    "type": "google_place",
                    "name": g.get("name"),
                    "lat": g.get("lat"),
                    "lon": g.get("lon"),
                    "website": g.get("details", {}).get("website"),
                    "source_url": g.get("details",{}).get("url") or None,
                    "tags": {},
                    "snippet": g.get("vicinity"),
                    "summary": "",
                    "opening_hours": g.get("details",{}).get("opening_hours"),
                    "is_open_now": g.get("details",{}).get("open_now"),
                    "distance_km": haversine_km(lat, lon, g.get("lat"), g.get("lon")) if g.get("lat") and g.get("lon") else None,
                    "final_score_raw": 0.0,
                    "source": "google",
                    "reviews": [{"source":"google","text":rv.get("text")} for rv in (g.get("details",{}).get("reviews") or [])],
                    "evidence_list": g.get("evidence_list", []),
                    "price_est": g.get("price_est") if g.get("price_est") else None,
                    "price_sources": g.get("price_sources", [])
                })
        except Exception as e:
            logging.warning(f"Google fallback failed: {e}")
    return candidates

# ---------------- ASYNC ENRICHMENT ----------------
async def fetch_page_html_with_browser(browser, url: str, headless=True, timeout=20000) -> Optional[str]:
    try:
        r = requests.get(url, timeout=8, headers={"User-Agent":"pipeline-bot/1.0"})
        r.raise_for_status()
        return r.text
    except Exception:
        page = None
        try:
            page = await browser.new_page()
            await page.goto(url, timeout=timeout)
            try:
                await page.wait_for_load_state("networkidle", timeout=3000)
            except Exception:
                pass
            html = await page.content()
            return html
        except Exception as e:
            logging.warning(f"Playwright fetch failed for {url}: {e}")
            return None
        finally:
            try:
                if page:
                    await page.close()
            except Exception:
                pass

def parse_budget_from_query(query: str) -> Optional[float]:
    q = query.lower()
    m = re.search(r'(?:under|below|<=|less than|max(?:imum)?|up to)\s*₹?\s*([0-9]{2,5})', q)
    if not m:
        m = re.search(r'([0-9]{2,5})\s*(?:rs|inr|rupee|₹)', q)
    if m:
        try:
            return float(m.group(1))
        except:
            return None
    return None

async def enrich_osm_results(osm_list: List[Dict], lat: float, lon: float, dish_keywords: List[str], local_dt: datetime, concurrency:int=3):
    res = []
    sem = asyncio.Semaphore(concurrency)
    pw = None; browser = None
    if PLAYWRIGHT_AVAILABLE:
        try:
            pw = await async_playwright().start()
            browser = await pw.chromium.launch(headless=True)
        except Exception as e:
            logging.warning(f"Playwright init failed: {e}")
            browser = None
            pw = None

    async def _proc(p):
        async with sem:
            site = p.get("website")
            source = site or f"https://www.openstreetmap.org/{p.get('type')}/{p.get('id')}"
            html = None
            if site:
                try:
                    rr = requests.get(site, timeout=8, headers={"User-Agent":"pipeline-bot/1.0"})
                    if rr.ok:
                        html = rr.text
                except Exception:
                    html = None
            if not html and browser:
                html = await fetch_page_html_with_browser(browser, source)
            if not html:
                try:
                    rr = requests.get(source, timeout=8, headers={"User-Agent":"pipeline-bot/1.0"})
                    if rr.ok:
                        html = rr.text
                except Exception:
                    html = None

            text = extract_text_from_html(html or "")
            snippet = text[:600]

            evidence_list = []
            menu_texts = []
            aggreg_menu = []
            aggreg_reviews = []
            try:
                if html:
                    soup = BeautifulSoup(html, "html.parser")
                    candidates = []
                    for a in soup.find_all("a", href=True):
                        href_raw = a.get("href") or ""
                        href = href_raw.lower()
                        if "menu" in href or "/menu" in href or "our-menu" in href or "menu.php" in href:
                            candidates.append(href_raw)
                    for b in soup.find_all(["button","a"]):
                        if b.string and "menu" in b.string.lower():
                            href = b.get("href")
                            if href:
                                candidates.append(href)
                    uniq=[]
                    for c in candidates:
                        if not c: continue
                        if c.startswith("//"):
                            c = "https:" + c
                        elif c.startswith("/"):
                            try:
                                from urllib.parse import urljoin
                                c = urljoin(site or source, c)
                            except Exception:
                                pass
                        elif not c.startswith("http"):
                            try:
                                from urllib.parse import urljoin
                                c = urljoin(site or source, c)
                            except Exception:
                                pass
                        if c not in uniq:
                            uniq.append(c)
                    for murl in uniq[:3]:
                        try:
                            rr = requests.get(murl, timeout=6, headers={"User-Agent":"pipeline-bot/1.0"})
                            if rr.ok:
                                mt = extract_text_from_html(rr.text, max_chars=6000)
                                if mt and len(mt.strip())>30:
                                    menu_texts.append({"url": murl, "text": mt[:4000]})
                        except Exception:
                            pass
                for mt in menu_texts:
                    evidence_list.append(make_evidence_item("menu_page", mt.get("url"), (mt.get("text") or "")[:800], confidence=0.9))
            except Exception:
                pass

            price_from_text = extract_price_from_text(text)
            price_from_menu = None
            for mt in menu_texts:
                pmt = extract_price_from_text(mt.get("text","") if isinstance(mt, dict) else mt)
                if pmt:
                    price_from_menu = pmt
                    evidence_list.append(make_evidence_item("menu_page_price", mt.get("url"), f"price:{pmt}", confidence=0.9))
                    break

            price_from_tags = None
            tags_local = p.get("tags", {}) or {}
            pr = tags_local.get("price") or tags_local.get("price:range") or tags_local.get("cost")
            if pr:
                m = re.search(r'([0-9]{2,5})', str(pr))
                if m:
                    try:
                        price_from_tags = int(m.group(1))
                        evidence_list.append(make_evidence_item("osm_tag", None, f"price tag:{price_from_tags}", confidence=0.6))
                    except Exception:
                        price_from_tags = None

            price_est = price_from_menu or price_from_text or price_from_tags or None
            price_sources = []
            if price_from_menu:
                price_sources.append("menu_page")
            elif price_from_text:
                price_sources.append("page_text")
            elif price_from_tags:
                price_sources.append("osm_tags")

            if tags_local:
                amen = tags_local.get("amenity")
                if amen:
                    evidence_list.append(make_evidence_item("osm_tag", None, f"amenity:{amen}", confidence=0.6))
                cuisine = tags_local.get("cuisine")
                if cuisine:
                    evidence_list.append(make_evidence_item("osm_tag", None, f"cuisine:{cuisine}", confidence=0.6))

            ev_text = find_evidence_from_text(text, dish_keywords)
            if ev_text:
                evidence_list.append(make_evidence_item("page_text", source if source else None, ev_text[:400], confidence=0.7))

            try:
                if html:
                    _, _, _, html_reviews_guess, aggregator_links = extract_menu_and_reviews_from_html(html)
                    amenu, arevs = fetch_aggregator_data(aggregator_links)
                    aggreg_menu.extend(amenu)
                    aggreg_reviews.extend(arevs + html_reviews_guess)
                    for link_list in aggregator_links.values():
                        for link in link_list:
                            evidence_list.append(make_evidence_item("aggregator", link, "aggregator_link", confidence=0.6))
            except Exception:
                pass

            for rv in (p.get("reviews") or [])[:4]:
                txt = rv.get("text") or rv.get("snippet") or ""
                if txt:
                    evidence_list.append(make_evidence_item("review", None, txt[:400], confidence=0.5))

            uniq_excerpts = {}
            final_evidence_objs = []
            for ev in evidence_list:
                key = (ev["type"], ev["url"], ev["excerpt"][:120])
                if key in uniq_excerpts:
                    if ev["confidence"] > uniq_excerpts[key]["confidence"]:
                        uniq_excerpts[key] = ev
                else:
                    uniq_excerpts[key] = ev
            for v in sorted(uniq_excerpts.values(), key=lambda x: -x["confidence"]):
                final_evidence_objs.append(v)

            low_evidence = False
            if not final_evidence_objs:
                low_evidence = True
            else:
                if final_evidence_objs[0].get("confidence",0.0) < 0.4:
                    low_evidence = True

            summary = (snippet[:140] + "...") if snippet and len(snippet) > 140 else (snippet or "No description available.")

            return {
                "id": p.get("id"),
                "type": p.get("type"),
                "name": p.get("name"),
                "lat": p.get("lat"),
                "lon": p.get("lon"),
                "website": p.get("website"),
                "source_url": source,
                "tags": p.get("tags", {}),
                "snippet": snippet,
                "summary": summary,
                "opening_hours": p.get("opening_hours"),
                "is_open_now": None,
                "distance_km": p.get("distance_km"),
                "distance_m": int((p.get("distance_km") or 0.0) * 1000.0) if p.get("distance_km") is not None else None,
                "final_score_raw": 0.0,
                "source": "osm",
                "reviews": p.get("reviews", []),
                "evidence": final_evidence_objs[0] if final_evidence_objs else None,
                "evidence_list": final_evidence_objs,
                "low_evidence": low_evidence,
                "price_est": price_est,
                "price_sources": price_sources,
                # NEW: keep explicit menu and aggregator reviews for dish metrics
                "menu_items": aggreg_menu,
                "extra_reviews": aggreg_reviews,
            }

    tasks = [asyncio.create_task(_proc(p)) for p in osm_list]
    done = await asyncio.gather(*tasks)
    if browser:
        try:
            await browser.close()
        except Exception:
            pass
    if pw:
        try:
            await pw.stop()
        except Exception:
            pass
    return done

# ---------------- ORCHESTRATION (main function) ----------------
async def find_places_extended(query: str,
                              lat: Optional[float]=None,
                              lon: Optional[float]=None,
                              top_k:int=8,
                              only_open:bool=False,
                              concurrency:int=3,
                              fail_on_api_error: bool = False) -> Dict[str,Any]:
    if not is_connected():
        raise RuntimeError("No internet connection")
    geo = get_public_ip()
    local_dt, period_label, preferred_radius_m = get_local_time_and_period(geo)
    if lat is None or lon is None:
        if geo:
            lat = geo.get("lat"); lon = geo.get("lon")
        else:
            raise RuntimeError("No location provided and IP geo failed")
    budget = parse_budget_from_query(query)
    dish = parse_dish_from_query(query)
    filters, dish_keywords = get_filters_and_keywords_for_dish(dish)
    logging.info(f"Dish parsed: {dish} | filters: {filters} | keywords: {dish_keywords}")

    radius = preferred_radius_m
    osm_places = overpass_query_places(lat, lon, radius_m=radius, limit=80, place_filters=filters)

    fallback_used = False
    if not osm_places:
        logging.warning("Overpass returned no places — attempting Google/Foursquare fallback")
        fallback_candidates = quick_google_or_fsq_fallback(lat, lon, radius, dish, dish_keywords, max_results=20)
        fallback_used = True
        osm_places = []
        for c in fallback_candidates:
            osm_places.append({
                "id": c["id"],
                "type": c["type"],
                "lat": c.get("lat"),
                "lon": c.get("lon"),
                "tags": {},
                "website": c.get("website"),
                "reviews": c.get("reviews", []),
                "price_est": c.get("price_est"),
                "price_sources": c.get("price_sources", []),
                "evidence_list": c.get("evidence_list", [])
            })

    for p in osm_places:
        p["distance_km"] = haversine_km(lat, lon, p.get("lat"), p.get("lon")) if p.get("lat") and p.get("lon") else None
        tags = p.get("tags", {})
        p["website"] = p.get("website") or tags.get("website") or tags.get("url") or None
        p["name"] = tags.get("name") or tags.get("operator") or p.get("name") or f"Place {p.get('type')}/{p.get('id')}"
        p["opening_hours"] = tags.get("opening_hours") or None

    osm_enriched = await enrich_osm_results(osm_places, lat, lon, dish_keywords, local_dt, concurrency=concurrency)

    # --- compute a simple presence score BEFORE expansion decision ---
    avg_presence = 0.0
    if osm_enriched:
        for e in osm_enriched:
            text = (e.get("snippet") or "") + "\n" + (e.get("summary") or "")
            kw_hits = detect_dish_presence_keyword(text, dish_keywords)
            evidence_bonus = 0.5 if e.get("evidence_list") else 0.0
            presence_score = kw_hits + evidence_bonus
            e["final_score_raw"] = float(presence_score)
        avg_presence = sum(e.get("final_score_raw", 0.0) for e in osm_enriched) / len(osm_enriched)
    logging.info("avg osm final_score_raw: %.3f", avg_presence)

    google_results = []
    # fs_results = []

    # Decide whether to expand:
    MIN_RESULTS_FOR_NO_EXPAND = 4
    MIN_STRONG_MATCHES = 2

    total_candidates_pref = sum(
        1 for r in osm_enriched
        if (r.get("distance_km") or 9999) * 1000.0 <= preferred_radius_m
    )

    # strong = within preferred radius AND not low_evidence
    strong_matches_pref = sum(
        1 for r in osm_enriched
        if (r.get("distance_km") or 9999) * 1000.0 <= preferred_radius_m
        and not r.get("low_evidence", False)
    )

    expanded_search_used = False
    expanded_from_m = None
    expanded_to_m = None
    expanded_reason = None

    if total_candidates_pref == 0:
        expanded_search_used = True
        expanded_reason = "no_results_in_initial_radius"
    elif strong_matches_pref < MIN_STRONG_MATCHES:
        expanded_search_used = True
        expanded_reason = "too_few_strong_matches"
    elif total_candidates_pref < MIN_RESULTS_FOR_NO_EXPAND:
        expanded_search_used = True
        expanded_reason = "too_few_results_within_preferred_radius"

    if expanded_search_used:
        synonyms = get_synonyms(dish)
        expanded_radius = min(preferred_radius_m * 2, 8000)
        expanded_from_m = preferred_radius_m
        expanded_to_m = expanded_radius
        if not osm_enriched:
            expanded_reason = f"No OSM candidates found in {preferred_radius_m} m"
        else:
            expanded_reason = f"Too few strong matches ({strong_matches_pref}) in {preferred_radius_m} m"
        logging.info(f"Expanding search (from {expanded_from_m}m to {expanded_to_m}m): {expanded_reason}. synonyms={synonyms}")
        try:
            print(f"Expanding search: {expanded_reason}. Radius {expanded_from_m/1000:.1f} km -> {expanded_to_m/1000:.1f} km")
        except Exception:
            pass

        for s in synonyms[:4]:
            if GOOGLE_PLACES_API_KEY:
                gres = search_google_places(lat, lon, expanded_radius, s, limit=10, fail_on_error=fail_on_api_error)
                for g in gres:
                    if g.get("place_id"):
                        details = get_google_place_details(g.get("place_id"), fail_on_error=fail_on_api_error)
                        g["details"] = details
                        g.setdefault("evidence_list", [])
                        if details.get("reviews"):
                            for rv in details.get("reviews")[:3]:
                                if rv.get("text"):
                                    g["evidence_list"].append(rv.get("text"))
                        g.setdefault("price_sources", [])
                        if details.get("price_level") is not None:
                            try:
                                lvl = int(details.get("price_level"))
                                mapping = {1:150, 2:300, 3:525, 4:900}
                                g["price_est"] = mapping.get(lvl)
                                g["price_sources"].append("google_price_level")
                            except Exception:
                                pass
                google_results.extend(gres)

        extra_filters = DISH2FILTERS.get("default")
        more_osm = overpass_query_places(lat, lon, radius_m=expanded_radius, limit=120, place_filters=extra_filters)
        more_enriched = await enrich_osm_results(more_osm[:60], lat, lon, dish_keywords, local_dt, concurrency=concurrency)
        osm_enriched.extend(more_enriched)
    else:
        if GOOGLE_PLACES_API_KEY:
            for r in sorted(osm_enriched, key=lambda x: x.get("final_score_raw",0), reverse=True)[:6]:
                try:
                    gres = search_google_places(r["lat"], r["lon"], 500, r["name"], limit=3)
                    for g in gres:
                        if g.get("place_id"):
                            g["details"] = get_google_place_details(g.get("place_id"))
                            g.setdefault("price_sources", [])
                            if g.get("details",{}).get("price_level") is not None:
                                try:
                                    lvl = int(g["details"].get("price_level"))
                                    mapping = {1:150, 2:300, 3:525, 4:900}
                                    g["price_est"] = mapping.get(lvl)
                                    g["price_sources"].append("google_price_level")
                                except Exception:
                                    pass
                            if g.get("details",{}).get("reviews"):
                                for rv in g["details"].get("reviews")[:3]:
                                    p = extract_price_from_text(rv.get("text","") or "")
                                    if p:
                                        g["price_est"] = p
                                        g["price_sources"].append("google_review")
                                        break
                    google_results.extend(gres)
                except Exception:
                    pass

    unified = dedupe_and_merge_results(osm_enriched, google_results, dedupe_radius_m=60)

    # --- improved per-entry post-processing (rating normalization, is_open, evidence, dedupe reviews, dish metrics) ---
    # compute max rating for normalization
    max_rating_val = 0.0
    for u in unified:
        r = u.get("google_rating") or u.get("rating") or (u.get("details", {}) or {}).get("rating")
        try:
            if r is not None:
                rv = float(r)
                if rv > max_rating_val:
                    max_rating_val = rv
        except Exception:
            continue
    if max_rating_val <= 0:
        max_rating_val = 5.0

    for u in unified:
        if u.get("lat") and u.get("lon"):
            u["distance_km"] = haversine_km(lat, lon, u["lat"], u["lon"])
        else:
            u["distance_km"] = None
        u["distance_m"] = int((u.get("distance_km") or 0.0) * 1000.0) if u.get("distance_km") is not None else None
        u["distance_display"] = (f"{u.get('distance_m')} m" if u.get('distance_m') and u.get('distance_m') < 1000 else (f"{round(u.get('distance_km'),2)} km" if u.get('distance_km') is not None else None))
        u.setdefault("price_est", None)
        u.setdefault("price_sources", [])

        # dish-aware metrics: menu/reviews/domain/page for ANY dish (biryani, coffee, pastry, etc.)
        try:
            u["dish_match_metrics"] = compute_dish_match_metrics(u, dish_keywords, dish)
        except Exception:
            u["dish_match_metrics"] = {
                "domain_hits": 0,
                "menu_hits": 0,
                "review_hits": 0,
                "page_hits": 0,
                "domain_score": 0.0,
                "menu_score": 0.0,
                "review_score": 0.0,
                "page_score": 0.0,
                "total_score": 0.0,
            }

        raw_rating = u.get("google_rating") or u.get("rating") or (u.get("details", {}) or {}).get("rating")
        try:
            raw_rating = float(raw_rating) if raw_rating is not None else None
        except Exception:
            raw_rating = None
        if raw_rating is None:
            rating_score = 0.0
        else:
            rating_score = max(0.0, min(1.0, raw_rating / float(max_rating_val)))
        u.setdefault("score_components", {})
        u["score_components"]["rating_score"] = round(rating_score, 4)

        # dedupe reviews
        deduped_reviews = []
        seen_texts = set()
        for rv in (u.get("reviews") or []):
            txt = (rv.get("text") if isinstance(rv, dict) else str(rv)) or ""
            txt_norm = re.sub(r'\s+', ' ', txt.strip()).lower()
            if not txt_norm:
                continue
            if txt_norm in seen_texts:
                continue
            seen_texts.add(txt_norm)
            if not isinstance(rv, dict):
                rv = {"source": "unknown", "text": txt}
            deduped_reviews.append(rv)
        u["reviews"] = deduped_reviews

        # is_open_now detection
        is_open = None
        if isinstance(u.get("is_open_now"), bool):
            is_open = u.get("is_open_now")
        else:
            details = u.get("details") or {}
            try:
                g_oh = details.get("opening_hours") or {}
                if isinstance(g_oh, dict) and "open_now" in g_oh:
                    is_open = bool(g_oh.get("open_now"))
                elif isinstance(g_oh, list) and g_oh:
                    try:
                        oh_text = "; ".join([str(x) for x in g_oh])
                        parsed = None
                        try:
                            parsed = parse_opening_hours_simple(oh_text, local_dt)  # assumed defined elsewhere
                        except Exception:
                            parsed = None
                        if parsed is True:
                            is_open = True
                        elif parsed is False:
                            is_open = False
                    except Exception:
                        pass
            except Exception:
                pass
            if is_open is None:
                oh_text = None
                tags = u.get("tags", {}) or {}
                oh_text = tags.get("opening_hours") or u.get("opening_hours") or u.get("details", {}).get("opening_hours")
                if isinstance(oh_text, (list, dict)):
                    try:
                        if isinstance(oh_text, list):
                            oh_text = "; ".join([str(x) for x in oh_text])
                        else:
                            oh_text = None
                    except Exception:
                        oh_text = None
                if oh_text:
                    try:
                        parsed = parse_opening_hours_simple(str(oh_text), local_dt)  # assumed defined
                        if parsed is True:
                            is_open = True
                        elif parsed is False:
                            is_open = False
                    except Exception:
                        is_open = None
        if is_open is None:
            is_open = False
        u["is_open_now"] = bool(is_open)

        # evidence consolidation
        u.setdefault("evidence_list", u.get("evidence_list") or [])
        best_evidence = None
        if u["evidence_list"]:
            best_conf = -1.0
            for ev in u["evidence_list"]:
                try:
                    conf = float(ev.get("confidence", 0.0)) if isinstance(ev, dict) else 0.0
                except Exception:
                    conf = 0.0
                if conf > best_conf:
                    best_conf = conf
                    best_evidence = ev
            if isinstance(best_evidence, dict):
                u["evidence"] = best_evidence
            else:
                u["evidence"] = {"type": "page_text", "url": None, "excerpt": str(best_evidence), "confidence": best_conf if best_conf>=0 else 0.0}
        else:
            constructed = None
            tags = u.get("tags", {}) or {}
            if tags:
                excerpt = ", ".join([f"{k}:{v}" for k, v in list(tags.items())[:4]])
                constructed = {"type": "osm_tag", "url": None, "excerpt": excerpt, "confidence": 0.6}
            elif u.get("price_est") is not None:
                constructed = {"type": "price_est", "url": None, "excerpt": f"estimated_price:{u.get('price_est')}", "confidence": 0.6}
            elif u.get("reviews"):
                r0 = u["reviews"][0]
                constructed = {"type": "review", "url": None, "excerpt": (r0.get("text") if isinstance(r0, dict) else str(r0))[:400], "confidence": 0.5}
            if constructed:
                u["evidence"] = constructed
                u["evidence_list"] = u.get("evidence_list", []) + [constructed]
            else:
                u["evidence"] = None

        has_menu = bool(u.get("menu_items") or [])
        has_reviews = bool(u.get("reviews") or [])
        has_strong_evidence = False
        for ev in (u.get("evidence_list") or []):
            conf = float(ev.get("confidence", 0.0)) if isinstance(ev, dict) else 0.0
            if conf >= 0.5:
                has_strong_evidence = True
                break
        ev_text = (u.get("evidence") or {}).get("excerpt") if isinstance(u.get("evidence"), dict) else None
        if not has_strong_evidence and ev_text:
            if any(kw.lower() in ev_text.lower() for kw in (dish_keywords or [])):
                has_strong_evidence = True
        low_evidence = not (has_menu or has_reviews or has_strong_evidence)
        u["low_evidence"] = bool(low_evidence)

        try:
            u["final_score_raw"] = compute_final_score_for_entry(
                u,
                dish_keywords,
                lat,
                lon,
                budget_inr=budget,
                dish=dish
            )
        except Exception:
            u["final_score_raw"] = u.get("final_score_raw", 0.0)

    # ---------------- Component-wise normalization (observed-max scaling) ----------------
    comp_keys = ["preference_score", "rating_score", "distance_score", "time_score", "price_score"]
    comp_max = {k: 0.0 for k in comp_keys}
    for u in unified:
        sc = u.get("score_components", {})
        for k in comp_keys:
            val = sc.get(k, 0.0)
            try:
                valf = float(val)
            except Exception:
                valf = 0.0
            sc[k] = valf
            if valf > comp_max[k]:
                comp_max[k] = valf
        u["score_components"] = sc

    for u in unified:
        sc = u.get("score_components", {})
        normalized_components = {}
        for k in comp_keys:
            rawv = float(sc.get(k, 0.0))
            maxv = comp_max.get(k, 0.0) or 0.0
            if maxv > 0:
                normv = max(0.0, min(1.0, rawv / maxv))
            else:
                normv = 0.0
            normalized_components[k] = round(normv, 4)
            sc[f"{k}_raw"] = round(rawv, 4)
        sc["normalized_components"] = normalized_components

        pref_n = normalized_components.get("preference_score", 0.0)
        rating_n = normalized_components.get("rating_score", 0.0)
        distance_n = normalized_components.get("distance_score", 0.0)
        time_n = normalized_components.get("time_score", 0.0)
        price_n = normalized_components.get("price_score", 0.0)

        new_raw = (pref_n * W_PREF) + (rating_n * W_RATING) + (distance_n * W_DIST) + (time_n * W_TIME) + (price_n * W_PRICE)
        u["final_score_raw"] = float(new_raw)
        u["score_components"] = sc

    normalize_scores(unified, min_scale=0.0, max_scale=1.0)

    only_open_applied = False
    if only_open:
        filtered = [r for r in unified if r.get("is_open_now") is True]
        if filtered:
            unified = filtered
            only_open_applied = True
        else:
            only_open_applied = True

    if not unified:
        expanded_search_used = True
        if not expanded_reason:
            expanded_reason = "No candidates found even after expansion."

    unified.sort(key=lambda x: (0 if x.get("distance_km") is not None else 1, -(x.get("final_score") or 0.0), x.get("distance_km") or 1e6))
    top = unified[:top_k]

    def format_entry(e):
        return {
            "name": e.get("name"),
            "lat": e.get("lat"),
            "lon": e.get("lon"),
            "source": e.get("source"),
            "source_url": e.get("source_url"),
            "website": e.get("website"),
            "tags": e.get("tags", {}),
            "snippet": e.get("snippet",""),
            "summary": e.get("summary",""),
            "opening_hours": e.get("opening_hours"),
            "is_open_now": e.get("is_open_now"),
            "distance_km": e.get("distance_km"),
            "distance_m": e.get("distance_m"),
            "distance_display": e.get("distance_display"),
            "price_est": e.get("price_est"),
            "price_sources": list(dict.fromkeys(e.get("price_sources", []))),
            "score": e.get("final_score"),
            "score_components": e.get("score_components"),
            "dish_match_metrics": e.get("dish_match_metrics"),
            "evidence": e.get("evidence"),
            "evidence_list": e.get("evidence_list", []),
            "low_evidence": e.get("low_evidence", True),
            "menu_items": e.get("menu_items", []),
            "extra_reviews": e.get("extra_reviews", []),
            "reviews": e.get("reviews", [])
        }
    final_results = [format_entry(t) for t in top]
    user_loc = {"lat": lat, "lon": lon}
    if geo:
        user_loc["city"] = geo.get("city") or geo.get("regionName") or geo.get("country")

    expanded_message = None
    if expanded_search_used or fallback_used:
        if expanded_from_m and expanded_to_m:
            expanded_message = f"Search expanded from {expanded_from_m/1000:.1f} km to {expanded_to_m/1000:.1f} km: {expanded_reason}"
        else:
            expanded_message = f"Search expansion used: {expanded_reason or 'expanded/fallback used'}"
        logging.info(expanded_message)
        try:
            print(expanded_message)
        except Exception:
            pass

    out = {
        "query": query,
        "dish": dish,
        "user_location": user_loc,
        "period": period_label,
        "local_time_iso": local_dt.isoformat(),
        "preferred_radius_m": preferred_radius_m,
        "expanded_search_used": expanded_search_used or fallback_used,
        "expanded_from_m": expanded_from_m,
        "expanded_to_m": expanded_to_m,
        "expanded_reason": expanded_reason,
        "expanded_message": expanded_message,
        "only_open_requested": only_open,
        "only_open_applied": only_open_applied,
        "results": final_results
    }
    return out

def find_places(query: str, lat: Optional[float]=None, lon: Optional[float]=None, top_k:int=8, only_open:bool=False):
    return asyncio.run(find_places_extended(query, lat=lat, lon=lon, top_k=top_k, only_open=only_open, concurrency=3))

# ---------------- CLI ----------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(prog="final.py", description="Find nearby food places and save JSON output")
    parser.add_argument("query", nargs="?", help="Query string (e.g. 'Nearest place for biryani')")
    parser.add_argument("--lat", type=float, help="Latitude (optional)")
    parser.add_argument("--lon", type=float, help="Longitude (optional)")
    parser.add_argument("--only-open", action="store_true", help="Only show currently open places")
    parser.add_argument("--out", help="Output filename (json). If omitted, uses timestamped file.")
    args = parser.parse_args()

    try:
        if not args.query:
            q = input("Enter your query (e.g. 'Nearest place for biryani'): ").strip()
        else:
            q = args.query

        lat = args.lat if args.lat is not None else None
        lon = args.lon if args.lon is not None else None

        out = find_places(q, lat=lat, lon=lon, top_k=8, only_open=args.only_open)

        out_filename = args.out
        if not out_filename:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            out_filename = f"geo_food_results_{ts}.json"
        if not out_filename.lower().endswith(".json"):
            out_filename = out_filename + ".json"

        # ensure directory exists
        out_dir = os.path.dirname(out_filename) or "."
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)

        with open(out_filename, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2, ensure_ascii=False)

        print(f"Results saved to: {out_filename}")

    except KeyboardInterrupt:
        print("\nCancelled by user.")
        sys.exit(1)
    except Exception as e:
        logging.exception(f"Unhandled error: {e}")
        print(f"Error: {e}")
        sys.exit(2)