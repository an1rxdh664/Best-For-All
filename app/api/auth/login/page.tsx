import { signIn } from "@/auth"

export default function LoginPage() {
    return (
        <>
            <div className="display-flex text-center align-center justify-center">
                <h1>Select a way to sign in</h1>
                <div id="buttonContainer" className="display-flex">
                    <button onClick={async () => {
                        "use server";
                        await signIn("google", { redirectTo : "/dashboard" })
                    }} className="cursor-pointer px-10">Google</button>
                    <button onClick={async () => {
                        "use server";
                        await signIn("github", { redirectTo : "/chat" })
                    }} className="cursor-pointer px-10">GitHub</button>
                </div>
            </div>
        </>
    )
}