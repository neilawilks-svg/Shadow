import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(message: string, status = 400, details?: unknown): NextResponse<{
  error: string;
  details?: unknown;
}> {
  return NextResponse.json(
    {
      error: message,
      details,
    },
    { status },
  );
}
