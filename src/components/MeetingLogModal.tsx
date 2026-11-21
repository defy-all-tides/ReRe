"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, Users, Mic, MessageSquare, Plus, Calendar, Clock, Sparkles, Trash2, Upload, FileText, ArrowRight } from "lucide-react";
import { NodeData, GroupData } from "@/app/page";
import { addActivity, compressImage, readAsDataURL, ActivityFile, ActivityData } from "@/lib/activityService";
import { supabase } from "@/lib/supabaseClient";

interface MeetingLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeData[];
  groups: GroupData[]; // [NEW] 그룹 데이터 연동
  onSaveSuccess: () => void;
  onEditProfile: (nodeId: string) => void;
}

export default function MeetingLogModal({ isOpen, onClose, nodes, groups, onSaveSuccess, onEditProfile }: MeetingLogModalProps) {
  const [step, setStep] = useState<"select" | "form" | "success">("select");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [activityName, setActivityName] = useState(""); // [NEW] 만남 이름 상태

  // [NEW] 세션 로딩 체계 통합
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
      } catch (err) {
        console.error("모달 사용자 세션 로드 오류:", err);
      }
    };
    loadUser();
  }, []);
  
  // 소통 폼 상태
  const [actType, setActType] = useState<"offline" | "online">("offline");
  const [duration, setDuration] = useState(2.0);
  const [isPrivate, setIsPrivate] = useState(true);
  const [initiatedByMe, setInitiatedByMe] = useState(false);
  const [noResponse30m, setNoResponse30m] = useState(false);
  const [activityDate, setActivityDate] = useState(new Date().toISOString().substring(0, 10));
  
  // 파일 첨부 상태
  const [attachedFiles, setAttachedFiles] = useState<ActivityFile[]>([]);
  const [shouldOverwriteFiles, setShouldOverwriteFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 모달이 닫히거나 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setStep("select");
      setSelectedNodeIds([]);
      setSearchTerm("");
      setAttachedFiles([]);
      setShouldOverwriteFiles(false);
      setActType("offline");
      setDuration(2.0);
      setIsPrivate(true);
      setInitiatedByMe(false);
      setNoResponse30m(false);
      setActivityDate(new Date().toISOString().substring(0, 10));
      setActivityName(""); // [NEW] 이름 초기화
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 검색 인물 필터링 및 소속 그룹별 이중 정렬 (1차: 소속그룹 순서, 2차: 이름 순서)
  const filteredNodes = nodes
    .filter(node => node.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const aGroupId = a.groupIds && a.groupIds.length > 0 ? a.groupIds[0] : undefined;
      const bGroupId = b.groupIds && b.groupIds.length > 0 ? b.groupIds[0] : undefined;

      const aGroupIndex = aGroupId ? groups.findIndex(g => g.id === aGroupId) : 999;
      const bGroupIndex = bGroupId ? groups.findIndex(g => g.id === bGroupId) : 999;

      if (aGroupIndex !== bGroupIndex) {
        return aGroupIndex - bGroupIndex;
      }
      return a.name.localeCompare(b.name, "ko");
    });

  // 인물 선택 토글
  const toggleSelectNode = (id: string) => {
    setSelectedNodeIds(prev => 
      prev.includes(id) ? prev.filter(nid => nid !== id) : [...prev, id]
    );
  };

  // 전체 선택 / 해제
  const selectAll = () => {
    setSelectedNodeIds(nodes.map(n => n.id));
  };
  
  const deselectAll = () => {
    setSelectedNodeIds([]);
  };

  // 파일 선택 처리 (압축 연동)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttached: ActivityFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.type.startsWith("image/")) {
          // 이미지 파일: HTML5 Canvas 기반 JPEG 75% 압축
          const compressedUrl = await compressImage(file);
          newAttached.push({
            name: file.name,
            type: "image",
            size: Math.round(compressedUrl.length * 0.75), // 대략적인 크기 바이트 계산
            url: compressedUrl
          });
        } else {
          // 문서 파일(대화록 .txt 등)
          const fileDataUrl = await readAsDataURL(file);
          newAttached.push({
            name: file.name,
            type: "document",
            size: file.size,
            url: fileDataUrl
          });
        }
      } catch (err) {
        console.error("파일 처리 실패:", file.name, err);
      }
    }

    if (shouldOverwriteFiles) {
      setAttachedFiles(newAttached);
    } else {
      setAttachedFiles(prev => [...prev, ...newAttached]);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 첨부 파일 삭제
  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 공동 만남 일괄 저장 핸들러
  const handleSaveMeeting = async () => {
    if (selectedNodeIds.length === 0 || isSaving || !userId) return;

    setIsSaving(true);
    try {
      const commonParticipantsCount = selectedNodeIds.length + 1; // 참석 인원 = 만난 사람 수 + 나(1명)

      // [NEW] 만남 이름 산출 (비어 있으면 기본 텍스트)
      const finalName = activityName.trim() || `${activityDate} ${actType === "offline" ? "오프라인 모임" : "온라인 소통"}`;

      // 비동기 일괄 등록 처리 (Promise.all)
      await Promise.all(
        selectedNodeIds.map(nodeId => {
          const activityData: Omit<ActivityData, "user_id"> = {
            node_id: nodeId,
            activity_name: finalName, // [NEW] 만남 이름 추가
            activity_type: actType,
            participants_count: commonParticipantsCount,
            duration: Number(duration),
            is_private: isPrivate,
            initiated_by_me: isPrivate ? initiatedByMe : false,
            no_response_30m: noResponse30m,
            activity_date: new Date(activityDate).toISOString(),
            files: attachedFiles
          };
          return addActivity(userId, activityData);
        })
      );

      // 성공 뷰로 이동
      setStep("success");
      onSaveSuccess(); // 실시간 마인드맵 레이아웃 재배치 트리거
    } catch (err) {
      console.error("공동 만남 저장 중 에러 발생:", err);
      alert("만남 기록 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 bg-slate-50 dark:bg-slate-900">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              {step === "select" && "누구를 만나셨나요?"}
              {step === "form" && "만남 소통 기록 추가"}
              {step === "success" && "기록 등록 완료!"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {step === "select" && "같이 시간을 보낸 관계 인물들을 모두 선택해주세요."}
              {step === "form" && "모두에게 일괄 등록될 공동 소통 및 사진/대화록을 기입합니다."}
              {step === "success" && "만남 기록이 완료되었습니다. 각 사람의 상세 메모를 입력해보세요!"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
          
          {/* Step 1: 인물 다중 선택 뷰 */}
          {step === "select" && (
            <div className="space-y-4 flex flex-col h-full">
              {/* 컨트롤 패널 */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* 검색 필드 */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="인물 이름 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-slate-800 dark:text-slate-200"
                  />
                </div>
                {/* 일괄 버튼 */}
                <div className="flex gap-2 shrink-0">
                  <button 
                    onClick={selectAll}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    전체 선택
                  </button>
                  <button 
                    onClick={deselectAll}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    선택 해제
                  </button>
                </div>
              </div>

              {/* 인물 리스트 그리드 */}
              {nodes.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                  아직 등록된 관계가 없습니다. 메인 네비게이션에서 먼저 관계를 등록해 주세요.
                </div>
              ) : filteredNodes.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                  검색된 인물이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[45vh] pr-1">
                  {filteredNodes.map(node => {
                    const isSelected = selectedNodeIds.includes(node.id);
                    return (
                      <button
                        key={node.id}
                        onClick={() => toggleSelectNode(node.id)}
                        className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all relative overflow-hidden group cursor-pointer ${
                          isSelected
                            ? "bg-brand-primary/5 border-brand-primary shadow-md shadow-blue-500/5 scale-[1.02]"
                            : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        {/* 프로필 이미지 */}
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200/50 flex items-center justify-center">
                          {node.photo ? (
                            <img src={node.photo} alt={node.name} className="w-full h-full object-cover" />
                          ) : (
                            <Users className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        {/* 이름 및 관계 */}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{node.name}</h4>
                          <span className="text-[10px] text-slate-400 font-semibold block truncate mb-0.5">{node.relation || "관계명 없음"}</span>
                          
                          {/* [NEW] 소속 그룹 컬러 배지 표시 */}
                          {node.groupIds && node.groupIds.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {node.groupIds.map(gid => {
                                const grp = groups.find(g => g.id === gid);
                                if (!grp) return null;
                                return (
                                  <span 
                                    key={gid}
                                    className="text-[8px] px-1 py-0.2 rounded font-extrabold text-white shrink-0 scale-90 origin-left"
                                    style={{ backgroundColor: grp.color }}
                                  >
                                    {grp.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 체크 마크 */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 p-0.5 rounded-full bg-brand-primary text-white">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 하단 제어 */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 mt-auto">
                <span className="text-xs font-bold text-slate-500">
                  선택된 인원: <span className="text-brand-primary font-extrabold text-sm">{selectedNodeIds.length}</span> 명
                </span>
                <button
                  disabled={selectedNodeIds.length === 0}
                  onClick={() => setStep("form")}
                  className={`px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedNodeIds.length > 0
                      ? "bg-brand-primary text-white hover:scale-105 active:scale-95 shadow-md shadow-blue-500/15"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  활동 입력하기
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 활동 정보 및 파일 첨부 입력 폼 */}
          {step === "form" && (
            <div className="space-y-5 text-left">
              {/* [NEW] 만남 이름 입력 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">만남 이름</label>
                <input
                  type="text"
                  placeholder="예: 삼겹살 모임 🍖, 카페 티타임 ☕"
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-200 font-bold"
                />
              </div>

              {/* 활동 분류 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">소통 종류</label>
                <div className="grid grid-cols-2 gap-3">
                  {(["offline", "online"] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActType(type)}
                      className={`py-3.5 rounded-2xl border flex flex-col items-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                        actType === type
                          ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/15 scale-[1.02]"
                          : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      {type === "offline" ? <Users className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      <span>{type === "offline" ? "오프라인 모임" : "온라인 소통(전화, 페톡)"}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 수치 데이터 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">참석 인원수</label>
                  <div className="px-3.5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-500">
                    {selectedNodeIds.length + 1}명 (나 포함)
                  </div>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-400">소통 시간 (지속시간)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={duration}
                      onChange={(e) => setDuration(Math.max(0.1, Number(e.target.value)))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">시간</span>
                  </div>
                </div>
              </div>

              {/* 대화 성격 (사적 vs 공적) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400">성격</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      isPrivate
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100"
                    }`}
                  >
                    사적인 약속 (기본 3점)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPrivate(false);
                      setInitiatedByMe(false);
                    }}
                    className={`py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      !isPrivate
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100"
                    }`}
                  >
                    공적 모임/업무 (기본 1점)
                  </button>
                </div>
              </div>

              {/* 추가 조건 체크 */}
              <div className="flex flex-wrap gap-4 pt-2">
                {isPrivate && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={initiatedByMe}
                      onChange={(e) => setInitiatedByMe(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">내가 먼저 제안했음 (+1점 가중치)</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={noResponse30m}
                    onChange={(e) => setNoResponse30m(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">누군가 30분 이상 지연/무응답 (-0.5점)</span>
                </label>
              </div>

              {/* 활동 날짜 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">날짜</label>
                <input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-200"
                />
              </div>

              {/* 파일 첨부 시스템 */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between pb-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">소통 기록 파일 및 사진 첨부</label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shouldOverwriteFiles}
                      onChange={(e) => setShouldOverwriteFiles(e.target.checked)}
                      className="rounded border-slate-350 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500 scale-90 cursor-pointer"
                    />
                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors">새 파일로 기존 파일 덮어쓰기</span>
                  </label>
                </div>
                
                {/* 첨부 드래그 앤 드롭 존 */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-brand-primary rounded-2xl flex flex-col items-center justify-center gap-2 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer group"
                >
                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-brand-primary group-hover:scale-110 transition-all" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">여기를 클릭하여 파일 첨부</span>
                  <span className="text-[10px] text-slate-400 font-medium">카톡 대화록(.txt) 또는 현장 사진(.png, .jpg) 등록 가능 (사진은 크기가 자동 압축됩니다)</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    onChange={handleFileChange}
                    accept="image/*,.txt"
                    className="hidden"
                  />
                </div>

                {/* 업로딩 스피너 */}
                {isUploading && (
                  <div className="text-center py-2 text-xs font-semibold text-brand-primary animate-pulse">
                    사진 압축 및 파일 암호화 변환 중...
                  </div>
                )}

                {/* 파일 섬네일/문서 리스트 */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 pt-2">
                    {attachedFiles.map((file, idx) => (
                      <div 
                        key={idx}
                        className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-2 max-w-[200px] relative group"
                      >
                        {file.type === "image" ? (
                          <div className="w-7 h-7 rounded bg-slate-200 overflow-hidden shrink-0">
                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="p-1 rounded bg-slate-200 text-slate-600 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate leading-tight">{file.name}</p>
                          <span className="text-[8px] text-slate-400 block font-semibold">{(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg shrink-0 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 하단 제어 */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 mt-6">
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  이전 단계
                </button>
                <button
                  onClick={handleSaveMeeting}
                  disabled={isSaving}
                  className={`px-5 py-3 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 hover:scale-105 transition-all shadow-md shadow-emerald-500/10 cursor-pointer ${
                    isSaving ? "opacity-50 cursor-not-allowed animate-pulse" : ""
                  }`}
                >
                  {isSaving ? "기록 일괄 저장 중..." : "만남 소통 저장"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 성공 및 개별 프로필 메모 가이드 뷰 */}
          {step === "success" && (
            <div className="py-8 flex flex-col items-center text-center space-y-6">
              {/* 성공 아이콘 */}
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center shadow-lg text-emerald-500 relative">
                <Sparkles className="w-10 h-10 animate-bounce" />
                <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping"></div>
              </div>

              {/* 완료 문구 */}
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">🎉 공동 만남 기록 완료!</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                  함께 만난 {selectedNodeIds.length}명의 관계도에 공동 소통(지속시간, 감쇠 점수, 파일 등)이 완벽히 기록되었으며, 마인드맵과의 거리가 실시간으로 단축되었습니다!
                </p>
              </div>

              {/* 정보 수정 유도 안내 카드 */}
              <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/30 p-5 rounded-2xl max-w-lg text-left shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full filter blur-xl"></div>
                <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  지능형 개별 관계 관리 메모 가이드
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">
                  방금 나눈 대화 중에 각 인물별로 다르게 기록할 메모가 있으신가요? 
                  예를 들어, **이번 만남에서 나눈 특별한 약속**이나 **인물별로 조심해야 할 유의사항** 등은 인물 프로필의 '기본 정보'에 추가로 적어 두시면 관계 관리가 훨씬 정밀해집니다.
                </p>
              </div>

              {/* 만남 멤버 목록 및 프로필 바로가기 */}
              <div className="w-full max-w-md space-y-2">
                <h5 className="text-[11px] font-bold text-slate-400 text-left uppercase tracking-wider">만남 멤버 개별 메모 관리 바로가기</h5>
                <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {selectedNodeIds.map(nid => {
                    const matchedNode = nodes.find(n => n.id === nid);
                    if (!matchedNode) return null;
                    return (
                      <div 
                        key={nid}
                        className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-200/50 bg-slate-200">
                            {matchedNode.photo ? (
                              <img src={matchedNode.photo} alt={matchedNode.name} className="w-full h-full object-cover" />
                            ) : (
                              <Users className="w-3.5 h-3.5 text-slate-500 m-auto mt-2" />
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{matchedNode.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose(); // 모달 닫기
                            onEditProfile(nid); // 사이드바 활성화
                          }}
                          className="px-3 py-1.5 bg-brand-primary text-white text-[10px] font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span>프로필 메모 수정</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 완료 버튼 */}
              <button
                type="button"
                onClick={onClose}
                className="w-full max-w-xs py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-xs font-bold hover:scale-105 active:scale-95 transition-all shadow-lg cursor-pointer"
              >
                메인 마인드맵으로 가기
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
