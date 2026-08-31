import logging
import asyncio
import json
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel

# Import the session logic from your existing final.py
try:
    from final import GeoFoodSession
except ImportError:
    # Fallback for testing if final.py isn't immediately present in path
    logging.error("Could not import GeoFoodSession from final.py. Ensure files are in the same directory.")
    GeoFoodSession = None

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

app = FastAPI(title="Geo-Food Assistant API")

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Geo-Food WebSocket API is running. Connect to /ws/chat."}


class QueryRequest(BaseModel):
    query: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    top_k: int = 5
    # Pass a convoId if you want per-conversation session state (follow-ups
    # like "show details of the second place") to work across requests.
    session_id: Optional[str] = None


# In-memory session store keyed by session_id, so follow-up questions in the
# same conversation reuse the previous search context (last results, focus
# index, etc). This resets if the server restarts — fine for a local dev
# setup; swap for a real store (Redis, DB row) if this needs to survive
# restarts or run across multiple worker processes.
_sessions: dict[str, "GeoFoodSession"] = {}


def _get_or_create_session(session_id: Optional[str], lat: Optional[float], lon: Optional[float], top_k: int):
    if not GeoFoodSession:
        return None
    if not session_id:
        # No session id supplied -> stateless one-off session (no follow-up memory)
        return GeoFoodSession(lat=lat, lon=lon, top_k=top_k)
    if session_id not in _sessions:
        _sessions[session_id] = GeoFoodSession(lat=lat, lon=lon, top_k=top_k)
    return _sessions[session_id]


@app.post("/query")
async def query_endpoint(payload: QueryRequest):
    """
    Plain HTTP endpoint for the Next.js orchestrator.

    Takes a raw user query + optional lat/lon/session_id, runs it through
    the geo-food pipeline (Phase_2 + nlp_layer via final.GeoFoodSession),
    and returns STRUCTURED JSON only (intent + cards) — no prose summary.
    The caller (Next.js /api/chat route) is expected to hand this JSON to
    the local LLM (Ollama) to phrase the actual user-facing reply.
    """
    if not GeoFoodSession:
        return {"intent": "error", "message": "Server misconfiguration: GeoFoodSession not found.", "cards": []}

    session = _get_or_create_session(payload.session_id, payload.lat, payload.lon, payload.top_k)

    # find_places / scraping is blocking, so run it off the event loop
    # thread (same reasoning as the websocket handler below).
    try:
        result = await asyncio.to_thread(session.handle_message_structured, payload.query)
    except Exception as e:
        logging.error(f"Error in /query: {e}")
        return {"intent": "error", "message": f"Internal server error: {e}", "cards": []}

    return result

@app.websocket("/ws/chat")
async def websocket_endpoint(
    websocket: WebSocket,
    lat: Optional[float] = Query(None, description="User's Latitude"),
    lon: Optional[float] = Query(None, description="User's Longitude"),
    top_k: int = Query(5, description="Number of top results to track")
):
    """
    WebSocket endpoint for conversational geo-food search.
    
    Usage:
      Connect to: ws://localhost:8000/ws/chat?lat=17.3850&lon=78.4867&top_k=5
    """
    await websocket.accept()
    
    client_info = f"{websocket.client.host}:{websocket.client.port}"
    logging.info(f"New connection from {client_info}. Lat: {lat}, Lon: {lon}")

    # Initialize the session state for this specific connection.
    # We create one session object per websocket connection to maintain context (follow-up questions).
    if GeoFoodSession:
        session = GeoFoodSession(lat=lat, lon=lon, top_k=top_k)
    else:
        await websocket.close(code=1011, reason="Server misconfiguration: GeoFoodSession not found")
        return

    try:
        while True:
            # 1. Receive message from client
            data = await websocket.receive_text()
            user_query = data.strip()
            
            logging.info(f"[{client_info}] Received: {user_query}")

            if not user_query:
                continue

            # 2. Process message using your existing logic
            # CRITICAL: We run handle_message in a separate thread using asyncio.to_thread.
            # This prevents 'RuntimeError: asyncio.run() cannot be called from a running event loop'
            # because your Phase_2 code calls asyncio.run() internally.
            try:
                response_text = await asyncio.to_thread(session.handle_message, user_query)
            except Exception as e:
                logging.error(f"Error processing message: {e}")
                response_text = f"Internal server error: {str(e)}"

            # 3. Send response back to client
            # We wrap it in JSON structure for easier frontend parsing
            response_payload = {
                "type": "message",
                "text": response_text
            }
            
            await websocket.send_json(response_payload)

    except WebSocketDisconnect:
        logging.info(f"Client {client_info} disconnected")
    except Exception as e:
        logging.error(f"WebSocket connection error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass