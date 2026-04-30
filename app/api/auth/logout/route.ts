import { NextResponse } from "next/server";

function getRequestOrigin(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (/^(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d+)?$/.test(host) ? "http" : "https");

  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", getRequestOrigin(request)));
  response.cookies.delete("soban_session");
  return response;
}
