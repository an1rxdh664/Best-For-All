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
                className="relative flex h-20 w-20 items-center justify-center rounded-full"
                style={{
                    background:
                        "linear-gradient(135deg, #f472b6 0%, #a78bfa 50%, #60a5fa 100%)",
                }}
            >
                <div className="flex gap-4">
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
        className="relative h-4 w-4 rounded-full bg-white/90"
        style={{ transformOrigin: "center", transition: "transform 0.08s linear" }}
    >
        <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gray-900" />
    </div>
);