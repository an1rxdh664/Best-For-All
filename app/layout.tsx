import "./globals.css";
import Link from "next/link";
import { Providers } from "./providers";
import { auth, signOut } from "@/auth";
import React from "react";

export default async function RootLayout({ children }: {children: React.ReactNode}) {

  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">
        <nav>
          <div className="navigatoin-container h-2xl w-full flex justify-between items-center text-center px-5">
            <div className="logo-container">
              <h1>LOGO</h1>
            </div>
            <div className="nav-links-container flex-1 flex mx-4 justify-between">

              <Link href="/"><p>HOME</p></Link>
              <Link href="/dashboard/"><p>DASHBOARD</p></Link>
              <Link href="/chat/"><p>CHAT</p></Link>
            </div>
            <div className="account-container">
              {
                session?.user ? (
                  <>
                    <button onClick={async () => {
                      "use server";
                      await signOut({redirectTo: "/"})
                    }}>Log Out</button>
                  </>
                ) : (
                  <>
                    <Link href={'/api/auth/login'}>
                      <button>
                        Log in
                      </button>
                    </Link>
                  </>
                )
              }
            </div>
          </div>
        </nav>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
