import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "이메일과 비밀번호를 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("❌ 서버 환경 변수에 NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 누락되었습니다.");
      return NextResponse.json(
        { success: false, message: "서버 설정 문제로 요청을 처리할 수 없습니다. .env.local을 확인해 주세요." },
        { status: 500 }
      );
    }

    // Server-side client 인스턴스 생성
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    if (!data.session || !data.user) {
      return NextResponse.json(
        { success: false, message: "로그인 유저 세션을 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    // profiles 테이블에서 프로필 데이터 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      message: "로그인에 성공했습니다.",
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      user: {
        name: profile?.name || data.user.user_metadata?.name || "사용자",
        email: data.user.email || email,
        securityQuestion: profile?.security_question || "",
        securityAnswer: profile?.security_answer || "",
      },
    });
  } catch (error: any) {
    console.error("❌ login API 서버 오류:", error);
    return NextResponse.json(
      { success: false, message: error.message || "서버 로그인 처리 중 예상치 못한 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
