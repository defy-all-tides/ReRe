"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { authService, User } from "@/lib/authService";
import { Mail, Lock, User as UserIcon, HelpCircle, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: Omit<User, "password">) => void;
}

type AuthMode = "login" | "register" | "find_email" | "find_password";

const SECURITY_QUESTIONS = [
  "가장 기억에 남는 여행지는 어디인가요?",
  "가장 처음으로 키운 반려동물의 이름은 무엇인가요?",
  "가장 인상 깊게 읽은 책이나 영화의 이름은 무엇인가요?",
  "나의 보물 1호는 무엇인가요?",
  "졸업한 초등학교의 이름은 무엇인가요?"
];

export default function AuthModal({ isOpen, onLoginSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 패스워드 표시 유무
  const [showPassword, setShowPassword] = useState(false);

  // 폼 입력 상태
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");

  // 비밀번호 재설정 단계 관련 상태
  const [resetStep, setResetStep] = useState<"verify" | "reset">("verify");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  if (!isOpen) return null;

  // 상태 초기화
  const resetForm = (targetMode: AuthMode) => {
    setMode(targetMode);
    setError(null);
    setSuccessMessage(null);
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setSecurityQuestion(SECURITY_QUESTIONS[0]);
    setSecurityAnswer("");
    setResetStep("verify");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  // 1. 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await authService.login(email, password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError("로그인 중 문제가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 2. 회원가입 처리
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !securityAnswer) {
      setError("모든 필수 입력 항목을 채워주세요.");
      return;
    }

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);

    try {
      const res = await authService.register(
        name,
        email,
        password,
        securityQuestion,
        securityAnswer
      );
      if (res.success) {
        setSuccessMessage(res.message);
        setTimeout(() => {
          resetForm("login");
        }, 1500);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 3. 이메일(아이디) 찾기 처리
  const handleFindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!name || !securityAnswer) {
      setError("이름과 답변 정보를 모두 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const res = await authService.findEmail(name, securityAnswer);
      if (res.success && res.email) {
        setSuccessMessage(
          `이메일을 찾았습니다!\n가입하신 이메일은 [ ${res.email} ] 입니다.`
        );
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError("이메일 찾기 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 4. 비밀번호 찾기 및 재설정 처리
  const handleFindPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (resetStep === "verify") {
      if (!email || !securityAnswer) {
        setError("이메일과 보안 답변을 모두 입력해 주세요.");
        return;
      }
      setLoading(true);
      try {
        const res = await authService.verifySecurityAnswer(email, securityAnswer);
        if (res.success) {
          setResetStep("reset");
        } else {
          setError(res.message);
        }
      } catch (err) {
        setError("인증 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    } else {
      if (!newPassword || !confirmNewPassword) {
        setError("새 비밀번호와 비밀번호 확인을 모두 입력해 주세요.");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
      if (newPassword.length < 6) {
        setError("비밀번호는 최소 6자 이상이어야 합니다.");
        return;
      }

      setLoading(true);
      try {
        const res = await authService.resetPassword(email, securityAnswer, newPassword);
        if (res.success) {
          setSuccessMessage("비밀번호가 성공적으로 재설정되었습니다! 곧 로그인 창으로 이동합니다.");
          setTimeout(() => {
            resetForm("login");
          }, 1800);
        } else {
          setError(res.message);
        }
      } catch (err) {
        setError("비밀번호 재설정 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
  };

  // 배경 클릭 시 모달이 닫히지 않고, 로그인 필수로 고정 (독립적인 인증 가드 역할)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
      {/* Decorative Blob */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-primary/20 dark:bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-brand-secondary/20 dark:bg-brand-secondary/10 rounded-full blur-[120px] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/85 backdrop-blur-2xl shadow-2xl shadow-slate-950/20 px-8 py-10 md:px-10"
      >
        <AnimatePresence mode="wait">
          {/* 1. 로그인 모드 */}
          {mode === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                  Relationship Reminder
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  사람과 생각의 연결, 지능형 마인드맵
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    이메일 주소
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      비밀번호
                    </label>
                    <button
                      type="button"
                      onClick={() => resetForm("find_password")}
                      className="text-xs font-semibold text-brand-primary hover:underline"
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-brand-primary hover:bg-blue-600 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    "로그인"
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center space-y-3">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  계정이 없으신가요?{" "}
                  <button
                    onClick={() => resetForm("register")}
                    className="font-bold text-brand-primary hover:underline"
                  >
                    회원가입하기
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => resetForm("find_email")}
                    className="text-xs font-semibold text-slate-400 hover:text-brand-primary transition-colors"
                  >
                    아이디(이메일) 찾기
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 2. 회원가입 모드 */}
          {mode === "register" && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => resetForm("login")}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">새 계정 만들기</h3>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    이름
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    이메일 주소
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      비밀번호
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="6자 이상"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      비밀번호 확인
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="다시 입력"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-brand-primary" /> 비밀번호 분실 시 보안 질문
                  </label>
                  <select
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:border-brand-primary outline-none text-slate-700 dark:text-slate-300 text-sm"
                  >
                    {SECURITY_QUESTIONS.map((q, idx) => (
                      <option key={idx} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    보안 질문 답변
                  </label>
                  <input
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="답변을 적어주세요."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-center gap-2 p-3 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-brand-primary hover:bg-blue-600 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    "회원가입 완료"
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* 3. 아이디(이메일) 찾기 모드 */}
          {mode === "find_email" && (
            <motion.div
              key="find_email"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => resetForm("login")}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">아이디(이메일) 찾기</h3>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                회원가입 시 등록했던 이름과 보안 질문의 답변을 입력하시면 이메일 주소를 찾을 수 있습니다.
              </p>

              <form onSubmit={handleFindEmail} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    가입자 이름
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    보안 질문 답변
                  </label>
                  <input
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="보안 답변을 입력해주세요."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="p-4 text-sm text-brand-primary bg-blue-50 dark:bg-slate-950/50 border border-brand-primary/20 rounded-xl whitespace-pre-line font-medium leading-relaxed">
                    {successMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-brand-primary hover:bg-blue-600 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    "이메일 찾기"
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* 4. 비밀번호 찾기 및 재설정 모드 */}
          {mode === "find_password" && (
            <motion.div
              key="find_password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => resetForm("login")}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {resetStep === "verify" ? "비밀번호 찾기" : "새 비밀번호 설정"}
                </h3>
              </div>

              {resetStep === "verify" ? (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    가입했던 이메일과 회원가입 시 설정한 보안 질문의 답변을 인증한 후 비밀번호를 재설정할 수 있습니다.
                  </p>

                  <form onSubmit={handleFindPassword} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        이메일 주소
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        보안 질문 답변
                      </label>
                      <input
                        type="text"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder="보안 답변을 입력해주세요."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                        required
                      />
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-brand-primary hover:bg-blue-600 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        "보안 답변 확인"
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    보안 질문 인증이 완료되었습니다. 변경할 새로운 비밀번호를 입력해주세요.
                  </p>

                  <form onSubmit={handleFindPassword} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        새 비밀번호
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="새 비밀번호 (6자 이상)"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        새 비밀번호 확인
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="비밀번호 재입력"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all dark:text-white text-sm"
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    {successMessage && (
                      <div className="flex items-center gap-2 p-3 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-xl">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{successMessage}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-brand-primary hover:bg-blue-600 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        "비밀번호 재설정 완료"
                      )}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
