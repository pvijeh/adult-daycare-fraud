import { NextResponse } from "next/server";


const NYC_ZIP_GEOMETRY =
  "https://data.cityofnewyork.us/resource/pri4-ifjk.geojson?$limit=300";

function loadGeometry(token?: string) {
  return fetch(NYC_ZIP_GEOMETRY, {
    headers: token ? { "X-App-Token": token } : {},
    cache: "no-store",
  });
}

export async function GET() {
  try {
    const token = process.env.SOCRATA_APP_TOKEN;
    let response = await loadGeometry(token);
    if (token && response.status === 403) {
      response = await loadGeometry();
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `NYC Open Data returned ${response.status}.` },
        { status: 502 },
      );
    }
    return NextResponse.json(await response.json(), {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load NYC ZIP boundaries." },
      { status: 502 },
    );
  }
}
