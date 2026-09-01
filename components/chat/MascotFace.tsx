"use client";

import { useEffect, useRef } from "react";

export default function MascotFace() {
    const faceRef = useRef<HTMLDivElement>(null);
    const leftEyeRef = useRef<HTMLDivElement>(null);
    const rightEyeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            const eyes = [leftEyeRef.current, rightEyeRef.current];
            for (const eye of eyes) {
                if (!eye) continue;
                const rect = eye.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
                const deg = (angle * 180) / Math.PI + 90;
                eye.style.transform = `rotate(${deg}deg)`;
            }
        };
        window.addEventListener("mousemove", handleMove);
        return () => window.removeEventListener("mousemove", handleMove);
    }, []);

    return (
        <div className="flex w-full justify-center py-4">
            <div
                ref={faceRef}
                className="relative flex h-36 w-36 items-center justify-center rounded-full"
                style={{
                    background:
                        "radial-gradient(circle at 32% 28%, #ffd9e8 0%, #f6a8ff 22%, #b48cff 45%, #7b6cf6 65%, #5b8ff9 85%, #4fa8ff 100%)",
                    boxShadow: "0 10px 30px rgba(120, 80, 220, 0.35)",
                }}
            >
                <div className="flex gap-6">
                    <Eye ref={leftEyeRef} />
                    <Eye ref={rightEyeRef} />
                </div>
            </div>
        </div>
    );
}

const Eye = ({ ref }: { ref: React.Ref<HTMLDivElement> }) => (
    <div
        ref={ref}
        style={{ transformOrigin: "50% 65%", transition: "transform 0.08s linear" }}
    >
        <svg width="26" height="26" viewBox="0 0 26 26">
            <polygon
                points="13,2 24,22 2,22"
                fill="#ffffff"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }}
            />
        </svg>
    </div>
);