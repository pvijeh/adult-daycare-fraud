import { NextResponse } from "next/server";


const NYC_ZIP_GEOMETRY =
  "https://data.cityofnewyork.us/resource/pri4-ifjk.geojson?$limit=300";

export async function GET() {
  try {
    const response = await fetch(NYC_ZIP_GEOMETRY, {
      headers: process.env.SOCRATA_APP_TOKEN
        ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN }
        : {},
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `NYC Open Data returned ${response.status}.` },
        { status: 502 },
      );
    }
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load NYC ZIP boundaries." },
      { status: 502 },
    );
  }
}
