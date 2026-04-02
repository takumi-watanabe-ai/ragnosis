import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log("Server-side env check:");
    console.log("URL:", supabaseUrl);
    console.log("Key exists:", !!supabaseAnonKey);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error: "Missing environment variables",
          details: {
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseAnonKey,
          },
        },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Test a simple RPC call
    const { data, error } = await supabase.rpc("get_ecosystem_overview");

    if (error) {
      return NextResponse.json(
        {
          error: "Supabase RPC failed",
          details: error,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Supabase connection working!",
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Exception occurred",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
