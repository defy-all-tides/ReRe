import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { email, securityAnswer, newPassword } = await request.json();

    if (!email || !securityAnswer || !newPassword) {
      return NextResponse.json(
        { success: false, message: "필수 입력 항목이 누락되었습니다." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ 서버 환경 변수에 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 누락되었습니다.");
      return NextResponse.json(
        { success: false, message: "서버 설정 문제로 요청을 처리할 수 없습니다. 관리자에게 문의해 주세요." },
        { status: 500 }
      );
    }

    // Server-side Admin Client 생성 (RLS 우회 및 관리 권한 획득)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 1. profiles 테이블에서 이메일과 보안 답변이 모두 일치하는 사용자 ID 획득
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .eq("security_answer", securityAnswer.trim())
      .single();

    if (profileError || !profile) {
      console.warn(`⚠️ 비밀번호 복구 실패 (이메일/답변 불일치): ${email}`);
      return NextResponse.json(
        { success: false, message: "입력하신 이메일과 보안 답변이 일치하지 않습니다." },
        { status: 400 }
      );
    }

    const userId = profile.id;

    // 2. Supabase Auth Admin API를 호출해 해당 유저의 비밀번호를 강제 재설정
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("❌ 비밀번호 강제 업데이트 실패:", updateError.message);
      return NextResponse.json(
        { success: false, message: `비밀번호 업데이트 실패: ${updateError.message}` },
        { status: 500 }
      );
    }

    console.log(`✅ 비밀번호 강제 복구 성공 (이메일): ${email}`);
    return NextResponse.json({
      success: true,
      message: "비밀번호가 성공적으로 재설정되었습니다.",
    });
  } catch (error: any) {
    console.error("❌ reset-password API 오류:", error);
    return NextResponse.json(
      { success: false, message: "서버 요청 처리 중 예상치 못한 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
