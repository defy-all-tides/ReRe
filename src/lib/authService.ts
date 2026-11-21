/**
 * 실시간 Supabase 인증 서비스 (Realtime Supabase Authentication Service)
 * 기존 가상 로컬 스토리지 기반의 코드를 100% 제거하고,
 * 실제 Supabase Auth 및 profiles 테이블 연동 체계로 마이그레이션하였습니다.
 */

import { supabase } from "./supabaseClient";

export interface User {
  email: string;
  name: string;
  securityQuestion: string;
  securityAnswer: string;
  password?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: Omit<User, "password">;
  email?: string;
}

export const authService = {
  /**
   * 회원가입 (/api/auth/register 서버 API 직접 이용으로 확장프로그램 차단 우회)
   */
  async register(
    name: string,
    email: string,
    password: string,
    securityQuestion: string,
    securityAnswer: string
  ): Promise<AuthResponse> {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
          securityQuestion,
          securityAnswer: securityAnswer.trim(),
        }),
      });

      const resData = await response.json();
      return resData;
    } catch (err: any) {
      console.error("❌ 회원가입 처리 중 오류:", err);
      return {
        success: false,
        message: "서버와의 통신에 실패했습니다. 네트워크 연결 상태를 확인해 주세요.",
      };
    }
  },

  /**
   * 로그인 (/api/auth/login 서버 API 직접 이용으로 확장프로그램 차단 우회)
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      const resData = await response.json();

      if (resData.success && resData.session) {
        // 서버에서 인증 완료 후 전달받은 세션 토큰을 클라이언트 SDK 세션으로 주입
        const { error: sessionErr } = await supabase.auth.setSession(resData.session);
        if (sessionErr) {
          console.warn("⚠️ 세션 설정 경고:", sessionErr.message);
        }
      }

      return resData;
    } catch (err: any) {
      console.error("❌ 로그인 처리 중 오류:", err);
      return {
        success: false,
        message: "서버와의 통신에 실패했습니다. 네트워크 연결 상태를 확인해 주세요.",
      };
    }
  },

  /**
   * 로그아웃 (Supabase Auth signOut)
   */
  async logout(): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: "성공적으로 로그아웃되었습니다." };
    } catch (err: any) {
      return { success: false, message: "로그아웃 중 에러가 발생했습니다." };
    }
  },

  /**
   * 현재 활성 세션 정보 확인 (로컬 세션 획득 및 profiles 데이터 연계)
   */
  async getCurrentUser(): Promise<Omit<User, "password"> | null> {
    try {
      // 1. 로컬에 저장된 세션 획득 (네트워크 fetch 없이 즉시 판별)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        // 백업: getUser() 시도
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        return {
          name: user.user_metadata?.name || "사용자",
          email: user.email || "",
          securityQuestion: user.user_metadata?.securityQuestion || "",
          securityAnswer: user.user_metadata?.securityAnswer || "",
        };
      }

      const user = session.user;
      let userName = user.user_metadata?.name || "사용자";
      let secQ = user.user_metadata?.securityQuestion || "";
      let secA = user.user_metadata?.securityAnswer || "";

      // profiles 테이블 추가 정보 조회 시도 (오류 발생 시 메타데이터 값으로 원활히 fallback)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          userName = profile.name || userName;
          secQ = profile.security_question || secQ;
          secA = profile.security_answer || secA;
        }
      } catch (pErr) {
        console.warn("⚠️ profiles 프로필 데이터 가져오기 스킵:", pErr);
      }

      return {
        name: userName,
        email: user.email || "",
        securityQuestion: secQ,
        securityAnswer: secA,
      };
    } catch (err) {
      console.error("❌ 세션 확인 오류:", err);
      return null;
    }
  },

  /**
   * 아이디(이메일) 찾기 (profiles 조회)
   */
  async findEmail(name: string, securityAnswer: string): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("email")
        .eq("name", name.trim())
        .eq("security_answer", securityAnswer.trim())
        .maybeSingle();

      if (error || !data) {
        return {
          success: false,
          message: "입력하신 이름과 답변에 일치하는 회원 정보가 없습니다.",
        };
      }

      return {
        success: true,
        message: "이메일을 성공적으로 조회했습니다.",
        email: data.email,
      };
    } catch (err: any) {
      return { success: false, message: "계정 조회 중 기술적 오류가 발생했습니다." };
    }
  },

  /**
   * 비밀번호 찾기를 위한 보안 질문/답변 일치 확인 (profiles 조회)
   */
  async verifySecurityAnswer(
    email: string,
    securityAnswer: string
  ): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .eq("security_answer", securityAnswer.trim())
        .maybeSingle();

      if (error || !data) {
        return {
          success: false,
          message: "입력하신 이메일과 보안 답변이 일치하지 않습니다.",
        };
      }

      return { success: true, message: "보안 질문 인증에 성공했습니다." };
    } catch (err: any) {
      return { success: false, message: "인증 처리 중 에러가 발생했습니다." };
    }
  },

  /**
   * 비밀번호 원격 강제 재설정 (서버 API 라우트 연동)
   * 일반 브라우저(클라이언트) 단에선 권한 우회가 불가하므로 서버 라우트 API(/api/auth/reset-password)에 안전하게 위임합니다.
   */
  async resetPassword(
    email: string,
    securityAnswer: string,
    newPassword: string
  ): Promise<AuthResponse> {
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          securityAnswer: securityAnswer.trim(),
          newPassword,
        }),
      });

      const resData = await response.json();
      return resData;
    } catch (err: any) {
      console.error("❌ 비밀번호 재설정 API 통신 오류:", err);
      return { success: false, message: "서버와의 통신에 실패했습니다. 네트워크 연결을 확인해 주세요." };
    }
  },

  /**
   * 계정 복구 가이드 안내를 위한 특정 이메일 가입 유저의 보안 질문 조회
   */
  async getSecurityQuestion(email: string): Promise<{ success: boolean; question?: string; message?: string }> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("security_question")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (error || !data) {
        return { success: false, message: "등록되지 않은 이메일 주소입니다." };
      }

      return { success: true, question: data.security_question };
    } catch (err: any) {
      return { success: false, message: "보안 질문을 조회하는 중 에러가 발생했습니다." };
    }
  }
};
