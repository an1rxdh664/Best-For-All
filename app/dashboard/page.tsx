import { auth, signOut } from "@/auth"
import { userAgent } from "next/server";

export default async function Dashboard() {

    const session = await auth();
    console.log(session);
    return (
        <>
            <div>
                <p>Signed in as, {session?.user?.email}</p>
                <p>Welcome, {session?.user?.name}</p>
                {/* <form action={async () => { "use server"; await signOut( {redirectTo : "/"} )}}>
                    <button type="submit">Sign out</button>
                </form> */}
            </div>
        </>
    )
}