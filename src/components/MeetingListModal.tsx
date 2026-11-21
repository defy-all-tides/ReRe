"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, Users, Mic, MessageSquare, Calendar, Clock, Trash2, Edit2, CheckCircle2, AlertCircle, Upload, FileText, Download, Shield } from "lucide-react";
import { NodeData, GroupData } from "@/app/page";
import { fetchAllActivities, updateActivity, deleteActivity, calculateActivityScore, compressImage, readAsDataURL, ActivityFile, ActivityData } from "@/lib/activityService";
import { supabase } from "@/lib/supabaseClient";

interface MeetingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeData[];
  groups: GroupData[];
  onSaveSuccess: () => void;
}

export default function MeetingListModal({ isOpen, onClose, nodes, groups, onSaveSuccess }: MeetingListModalProps) {
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // 검색 및 필터 상태
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "offline" | "online" | "contact">("all");

  // 편집 모드 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"offline" | "online" | "contact">("offline");
  const [editParticipants, setEditParticipants] = useState(2);
  const [editDuration, setEditDuration] = useState(1.0);
  const [editIsPrivate, setEditIsPrivate] = useState(true);
  const [editInitiatedByMe, setEditInitiatedByMe] = useState(false);
  const [editNoResponse30m, setEditNoResponse30m] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editFiles, setEditFiles] = useState<ActivityFile[]>([]);
  const [shouldOverwriteFiles, setShouldOverwriteFiles] = useState(false);
  
  // 업로드 및 상태 제어
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 로그인 세션 조회
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
      } catch (err) {
        console.error("세션 질의 에러:", err);
      }
    };
    loadUser();
  }, []);

  // 전체 활동 내역 로드
  const loadData = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const list = await fetchAllActivities(userId);
      setActivities(list);
    } catch (err) {
      console.error("활동 내역 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      loadData();
      setEditingId(null);
      setSelectedPhotoUrl(null);
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  // 필터링 및 검색 로직 (만남 이름 또는 관계 인물 이름 매핑 검색)
  const filteredActivities = activities.filter(act => {
    const node = nodes.find(n => n.id === act.node_id);
    const nodeName = node ? node.name.toLowerCase() : "삭제된 인물";
    const actName = (act.activity_name || "").toLowerCase();
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = nodeName.includes(searchLower) || actName.includes(searchLower);
    const matchesType = typeFilter === "all" || act.activity_type === typeFilter;

    return matchesSearch && matchesType;
  });

  // 편집 시작 초기화
  const startEdit = (act: ActivityData) => {
    setEditingId(act.id || null);
    setEditName(act.activity_name || "");
    setEditType(act.activity_type);
    setEditParticipants(act.participants_count);
    setEditDuration(act.duration);
    setEditIsPrivate(act.is_private);
    setEditInitiatedByMe(act.initiated_by_me);
    setEditNoResponse30m(act.no_response_30m);
    setEditDate(new Date(act.activity_date).toISOString().substring(0, 10));
    setEditFiles(act.files || []);
    setShouldOverwriteFiles(false);
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingId(null);
  };

  // 신규 파일 첨부 처리 (Canvas JPEG 압축 엔진 탑재)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttached: ActivityFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.type.startsWith("image/")) {
          const compressedUrl = await compressImage(file);
          newAttached.push({
            name: file.name,
            type: "image",
            size: Math.round(compressedUrl.length * 0.75),
            url: compressedUrl
          });
        } else {
          const fileDataUrl = await readAsDataURL(file);
          newAttached.push({
            name: file.name,
            type: "document",
            size: file.size,
            url: fileDataUrl
          });
        }
      } catch (err) {
        console.error("파일 압축/변환 에러:", file.name, err);
      }
    }

    if (shouldOverwriteFiles) {
      setEditFiles(newAttached);
    } else {
      setEditFiles(prev => [...prev, ...newAttached]);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 첨부 파일 부분 삭제
  const removeEditFile = (idx: number) => {
    setEditFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // 저장 처리
  const handleUpdate = async (act: ActivityData) => {
    if (!userId || !act.id || isSaving) return;

    setIsSaving(true);
    try {
      const finalName = editName.trim() || `${editDate} ${
        editType === "offline" ? "오프라인 모임" : editType === "online" ? "온라인 소통" : "연락 소통"
      }`;

      const updatedFields: Partial<ActivityData> = {
        activity_name: finalName,
        activity_type: editType,
        participants_count: editParticipants,
        duration: Number(editDuration),
        is_private: editIsPrivate,
        initiated_by_me: editIsPrivate ? editInitiatedByMe : false,
        no_response_30m: editNoResponse30m,
        activity_date: new Date(editDate).toISOString(),
        files: editFiles
      };

      const result = await updateActivity(userId, act.node_id, act.id, updatedFields);
      if (result) {
        // 리스트 상태 실시간 반영
        setActivities(prev => prev.map(a => (a.id === act.id ? result : a)));
        setEditingId(null);
        onSaveSuccess(); // 마인드맵 즉시 정렬
      }
    } catch (err) {
      console.error("활동 수정 중 에러:", err);
      alert("만남 기록 수정에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // 삭제 처리
  const handleDelete = async (act: ActivityData) => {
    if (!userId || !act.id) return;
    if (confirm(`'${act.activity_name || "이 만남"}' 기록을 정말 삭제하시겠습니까?`)) {
      try {
        const success = await deleteActivity(userId, act.node_id, act.id);
        if (success) {
          setActivities(prev => prev.filter(a => a.id !== act.id));
          onSaveSuccess(); // 삭제 시 친밀도 재계산 마인드맵 자동 정렬
        }
      } catch (err) {
        console.error("소통 기록 삭제 에러:", err);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-500" />
              만남/소통 이력 관리 목록
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              관계를 맺고 있는 전체 인물과의 모임 내역을 한눈에 조회하고, 이름, 시간, 날짜 및 첨부파일을 실시간 수정합니다.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls */}
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3 shrink-0">
          {/* 검색 창 */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="만남 이름 또는 관계 인물 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-700 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-200 font-bold"
            />
          </div>

          {/* 소통 형태 필터 */}
          <div className="flex gap-1.5 overflow-x-auto shrink-0 pb-1 sm:pb-0">
            {([
              { value: "all", label: "전체보기" },
              { value: "offline", label: "오프라인" },
              { value: "online", label: "온라인" },
              { value: "contact", label: "메시지" }
            ] as const).map(filter => (
              <button
                key={filter.value}
                onClick={() => setTypeFilter(filter.value)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                  typeFilter === filter.value
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10 scale-105"
                    : "bg-white dark:bg-slate-850 border border-slate-200/50 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-350"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="text-center py-20 text-slate-400 text-xs font-bold animate-pulse">
              데이터베이스 활동 이력을 열심히 불러오는 중입니다... 🚀
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-24 text-slate-400 text-xs">
              검색 조건에 매칭되는 소통 만남 기록이 존재하지 않습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredActivities.map(act => {
                const node = nodes.find(n => n.id === act.node_id);
                const nodeGroups = node
                  ? (node.groupIds || []).map(gid => groups.find(g => g.id === gid)).filter(Boolean) as GroupData[]
                  : [];
                const actScore = calculateActivityScore(act);
                const isEditing = editingId === act.id;

                return (
                  <div 
                    key={act.id}
                    className={`p-4 bg-white dark:bg-slate-900 border rounded-3xl transition-all relative ${
                      isEditing
                        ? "border-emerald-500/80 shadow-lg shadow-emerald-500/5 bg-slate-50/20 dark:bg-slate-850/20 scale-[0.99]"
                        : "border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700/80 hover:shadow-md"
                    }`}
                  >
                    {isEditing ? (
                      /* ===================== [편집 모드 양식] ===================== */
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Edit2 className="w-3 h-3" />
                            소통 정보 수정 중
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            대상자: {node ? node.name : "삭제된 인물"}
                          </span>
                        </div>

                        {/* 만남 이름 */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">만남 이름</label>
                          <input
                            type="text"
                            placeholder="만남 이름을 입력하세요 (비워두면 자동 연산)"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-750 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 text-slate-850 dark:text-slate-200"
                          />
                        </div>

                        {/* 소통방식, 인원, 지속시간 */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400">소통 분류</label>
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as any)}
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-750 rounded-xl text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                            >
                              <option value="offline">오프라인 만남</option>
                              <option value="online">온라인 소통</option>
                              <option value="contact">메시지 연락</option>
                            </select>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400">소통 인원수</label>
                            <input
                              type="number"
                              min={2}
                              value={editParticipants}
                              onChange={(e) => setEditParticipants(Math.max(2, Number(e.target.value)))}
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-750 rounded-xl text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400">지속 시간 (시간)</label>
                            <input
                              type="number"
                              step={0.1}
                              min={0.1}
                              value={editDuration}
                              onChange={(e) => setEditDuration(Math.max(0.1, Number(e.target.value)))}
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-750 rounded-xl text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400">날짜 선택</label>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-750 rounded-xl text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                            />
                          </div>
                        </div>

                        {/* 성격 가중치 필드 */}
                        <div className="flex flex-wrap gap-4 pt-1.5">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editIsPrivate}
                              onChange={(e) => {
                                setEditIsPrivate(e.target.checked);
                                if (!e.target.checked) setEditInitiatedByMe(false);
                              }}
                              className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                            />
                            사적 대화 (기본 3점)
                          </label>

                          {editIsPrivate && (
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editInitiatedByMe}
                                onChange={(e) => setEditInitiatedByMe(e.target.checked)}
                                className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                              />
                              내가 선제안 (+1점 보너스!)
                            </label>
                          )}

                          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editNoResponse30m}
                              onChange={(e) => setEditNoResponse30m(e.target.checked)}
                              className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                            />
                            30분 이상 지연 무응답 (-0.5점 패널티)
                          </label>
                        </div>

                        {/* 첨부파일 편집 */}
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-400 block">첨부 파일 관리</label>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={shouldOverwriteFiles}
                                onChange={(e) => setShouldOverwriteFiles(e.target.checked)}
                                className="rounded border-slate-350 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500 scale-80 cursor-pointer"
                              />
                              <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors">새 파일로 기존 파일 덮어쓰기</span>
                            </label>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            {/* 추가 드롭존 버튼 */}
                            <div 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-10 h-10 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer group hover:scale-102 transition-all"
                            >
                              <Upload className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" />
                              <input
                                type="file"
                                ref={fileInputRef}
                                multiple
                                onChange={handleFileChange}
                                accept="image/*,.txt"
                                className="hidden"
                              />
                            </div>
                            {isUploading && (
                              <span className="text-[9px] font-bold text-brand-primary animate-pulse">압축 인코딩 처리 중...</span>
                            )}
                            
                            {/* 첨부파일 목록 */}
                            {editFiles.map((file, fileIdx) => (
                              <div 
                                key={fileIdx} 
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-1.5 max-w-[170px] relative group"
                              >
                                <span className="text-[9px] font-bold text-slate-750 dark:text-slate-350 truncate max-w-[100px]">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeEditFile(fileIdx)}
                                  className="text-slate-400 hover:text-red-500 shrink-0 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 저장/취소 버튼 */}
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2 border border-slate-150 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer"
                          >
                            취소
                          </button>
                          <button
                            disabled={isSaving}
                            onClick={() => handleUpdate(act)}
                            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/10 hover:scale-102 transition-all cursor-pointer"
                          >
                            {isSaving ? "저장 중..." : "수정 완료"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ===================== [목록 조회 뷰] ===================== */
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* 왼쪽 인물 정보 및 상세 */}
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* 인물 프로필 사진 */}
                          <div 
                            className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center shadow-md relative overflow-hidden p-0.5 shrink-0"
                            style={(() => {
                              if (nodeGroups.length === 0) return { border: '2px solid white' };
                              if (nodeGroups.length === 1) return { border: `2px solid ${nodeGroups[0].color}` };
                              const colors = nodeGroups.map(g => g.color);
                              let gradient = "conic-gradient(";
                              colors.forEach((color, i) => {
                                const start = (i / colors.length) * 360;
                                const end = ((i + 1) / colors.length) * 360;
                                gradient += `${color} ${start}deg ${end}deg${i === colors.length - 1 ? "" : ", "}`;
                              });
                              gradient += ")";
                              return { background: gradient };
                            })()}
                          >
                            <div className="w-full h-full bg-white dark:bg-slate-900 rounded-full flex items-center justify-center overflow-hidden">
                              {node && node.photo ? (
                                <img src={node.photo} alt={node.name} className="w-full h-full object-cover" />
                              ) : (
                                <Users className="w-5 h-5 text-slate-350 dark:text-slate-650" />
                              )}
                            </div>
                          </div>

                          <div className="min-w-0 text-left">
                            {/* 만남 타이틀 및 날짜 */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-150 truncate max-w-[200px]" title={act.activity_name}>
                                {act.activity_name || (act.activity_type === "offline" ? "오프라인 만남" : act.activity_type === "online" ? "온라인 소통" : "연락 세션")}
                              </span>
                              <span className="text-[9px] text-slate-400 font-extrabold font-outfit uppercase tracking-wide shrink-0">
                                {new Date(act.activity_date).toISOString().substring(0, 10)}
                              </span>
                            </div>

                            {/* 관계 텍스트 & 소속 그룹 컬러 배지 */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-bold text-slate-400">
                                {node ? `${node.name} (${node.relation || "관계명 없음"})` : "삭제된 인물"}
                              </span>
                              
                              {/* 소속 그룹 배지 */}
                              {nodeGroups.map(grp => (
                                <span 
                                  key={grp.id}
                                  className="text-[7.5px] px-1.5 py-0.2 rounded font-extrabold text-white shrink-0 scale-90 origin-left"
                                  style={{ backgroundColor: grp.color }}
                                >
                                  {grp.name}
                                </span>
                              ))}
                            </div>

                            {/* 세부 배지 조건 정보 */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[8.5px] font-bold text-slate-400 dark:text-slate-500">
                              <span className="flex items-center gap-0.5">
                                <Users className="w-2.5 h-2.5" />
                                {act.participants_count === 2 ? "1:1 대화" : `${act.participants_count}명`}
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {act.duration}시간
                              </span>
                              <span>·</span>
                              <span className={act.is_private ? "text-slate-500" : "text-amber-500"}>{act.is_private ? "사적" : "공적"}</span>
                              {act.initiated_by_me && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-500 flex items-center gap-0.5">
                                    <Shield className="w-2.5 h-2.5" />
                                    선제안
                                  </span>
                                </>
                              )}
                              {act.no_response_30m && (
                                <>
                                  <span>·</span>
                                  <span className="text-red-500">지연 무응답</span>
                                </>
                              )}
                            </div>

                            {/* 파일 첨부 섬네일 */}
                            {act.files && act.files.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {act.files.map((file, fIdx) => (
                                  <div key={fIdx} className="relative shrink-0">
                                    {file.type === "image" ? (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPhotoUrl(file.url)}
                                        className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:scale-105 active:scale-95 transition-all block cursor-pointer"
                                      >
                                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                      </button>
                                    ) : (
                                      <a
                                        href={file.url}
                                        download={file.name}
                                        className="h-11 px-2.5 rounded-lg border border-slate-200/50 dark:border-slate-700 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-[8.5px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                                        <span className="max-w-[70px] truncate">{file.name}</span>
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 오른쪽 점수 뱃지 및 제어 컨트롤 */}
                        <div className="flex sm:flex-col items-end gap-2.5 shrink-0 self-start sm:self-center">
                          {/* 친밀도 획득 에너지 점수 */}
                          <div className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl text-center">
                            <span className="text-[9px] font-extrabold text-emerald-500 uppercase tracking-wider block">친밀 에너지</span>
                            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">+{actScore.toFixed(2)}</span>
                          </div>

                          {/* 수정 / 삭제 제어 퀵 버튼 */}
                          <div className="flex gap-1.5 mt-1">
                            <button
                              onClick={() => startEdit(act)}
                              className="p-2 border border-slate-100 dark:border-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                              title="기록 수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(act)}
                              className="p-2 border border-slate-100 dark:border-slate-850 hover:border-red-300 dark:hover:border-red-900/35 text-slate-400 hover:text-red-500 rounded-xl transition-all cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/25"
                              title="기록 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 풀스크린 라이트박스 뷰어 모달 */}
      <AnimatePresence>
        {selectedPhotoUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setSelectedPhotoUrl(null)}
          >
            <button 
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all shrink-0 cursor-pointer"
              onClick={() => setSelectedPhotoUrl(null)}
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={selectedPhotoUrl} 
              alt="만남 사진 확대 보기" 
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/5"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
