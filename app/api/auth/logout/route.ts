import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  response.cookies.delete("soban_session");
  return response;
}
