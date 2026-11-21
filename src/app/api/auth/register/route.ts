import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { name, email, password, securityQuestion, securityAnswer } = await request.json();

    if (!name || !email || !password || !securityAnswer) {
      return NextResponse.json(
        { success: false, message: "필수 입력 항목이 누락되었습니다." },
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          name: name.trim(),
          securityQuestion,
          securityAnswer: securityAnswer.trim(),
        },
      },
    });

    if (signUpError) {
      return NextResponse.json(
        { success: false, message: signUpError.message },
        { status: 400 }
      );
    }

    if (!signUpData.user) {
      return NextResponse.json(
        { success: false, message: "계정을 생성하는 데 실패했습니다. 다시 시도해 주세요." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "회원가입이 성공적으로 완료되었습니다!",
    });
  } catch (error: any) {
    console.error("❌ register API 서버 오류:", error);
    return NextResponse.json(
      { success: false, message: error.message || "서버 회원가입 처리 중 예상치 못한 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
