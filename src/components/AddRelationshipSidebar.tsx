"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, MessageSquare, Mic, PenLine, Trash2, Plus, Calendar, Clock, Sparkles, Shield, Users, FileText, Upload } from "lucide-react";
import { NodeData, GroupData } from "@/app/page";
import { supabase } from "@/lib/supabaseClient";
import { fetchActivities, addActivity, deleteActivity, calculateIntimacyScore, calculateDistance, calculateActivityScore, compressImage, readAsDataURL, ActivityData } from "@/lib/activityService";

interface AddRelationshipSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: { 
    id?: string; 
    name: string; 
    relation: string; 
    age?: string; 
    job?: string; 
    photo?: string; 
    groupIds: string[]; 
    newGroupName?: string;
    memoAppointment?: string;
    memoPersonal?: string;
    memoHistory?: string;
    memoPrecautions?: string;
  }) => void;
  onDisconnect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDeleteGroup?: (id: string) => void;
  nodes?: NodeData[];
  selectedNodeId?: string | null;
  groups?: GroupData[];
}

type SidebarView = "selection" | "manual" | "profile";

export default function AddRelationshipSidebar({ isOpen, onClose, onSave, onDisconnect, onDelete, onDeleteGroup, nodes, selectedNodeId, groups }: AddRelationshipSidebarProps) {
  const [view, setView] = useState<SidebarView>("selection");
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({ 
    name: "", relation: "", age: "", job: "", photo: "", groupIds: [] as string[], newGroupName: "",
    memoAppointment: "", memoPersonal: "", memoHistory: "", memoPrecautions: ""
  });

  useEffect(() => {
    if (selectedNodeId) {
      const node = nodes?.find(n => n.id === selectedNodeId);
      if (node) {
        setFormData({ 
          name: node.name, 
          relation: node.relation, 
          age: node.age || "", 
          job: node.job || "", 
          photo: node.photo || "", 
          groupIds: node.groupIds || (node.groupId ? [node.groupId] : []), 
          newGroupName: "",
          memoAppointment: node.memoAppointment || "",
          memoPersonal: node.memoPersonal || "",
          memoHistory: node.memoHistory || "",
          memoPrecautions: node.memoPrecautions || ""
        });
      }
      setView("profile");
    } else if (isOpen && view === "profile") {
      setView("selection");
    }
  }, [selectedNodeId, isOpen, nodes]);

  const handleManualAdd = () => {
    setFormData({ 
      name: "", relation: "", age: "", job: "", photo: "", groupIds: [] as string[], newGroupName: "",
      memoAppointment: "", memoPersonal: "", memoHistory: "", memoPrecautions: ""
    });
    setView("manual");
  };

  const resetView = () => {
    onClose();
    setTimeout(() => {
      if (!selectedNodeId) setView("selection");
      setFormData({ 
        name: "", relation: "", age: "", job: "", photo: "", groupIds: [] as string[], newGroupName: "",
        memoAppointment: "", memoPersonal: "", memoHistory: "", memoPrecautions: ""
      });
    }, 300);
  };

  // Supabase Storage 이미지 압축 가공 업로드 핸들러
  const handleImageUpload = async (file: File) => {
    try {
      setIsUploading(true);
      
      let uploadFile: File | Blob = file;
      let fileExt = 'webp';

      // 1. WebP 파일일 경우: 변환 과정에서 깨짐을 방지하기 위해 압축 가공 없이 원본 파일 그대로 다이렉트 업로드
      if (file.type === 'image/webp' || file.name.endsWith('.webp')) {
        uploadFile = file;
        fileExt = 'webp';
      } else {
        // 2. png, jpg 등 다른 파일일 경우: 500x500 WebP 포맷으로 깨짐 없이 안전하게 압축 가공
        const blob = await processImageToBlob(file);
        uploadFile = new File([blob], `profile_${Date.now()}.webp`, { type: 'image/webp' });
        fileExt = 'webp';
      }

      // B. Storage 'profiles' 버킷에 업로드
      const fileName = `node_${Math.random().toString(36).substring(2, 11)}_${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('profiles')
        .upload(fileName, uploadFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // C. Public URL 추출
      const { data: { publicUrl } } = supabase.storage
        .from('profiles')
        .getPublicUrl(fileName);

      setFormData((prev: any) => ({ ...prev, photo: publicUrl }));
    } catch (err) {
      console.error("❌ 프로필 이미지 업로드 실패:", err);
      alert("이미지 업로드에 실패했습니다. Storage 'profiles' 버킷 RLS 정책을 확인해 주세요.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave({ 
        name: formData.name, 
        relation: formData.relation, 
        age: formData.age,
        job: formData.job,
        photo: formData.photo,
        id: selectedNodeId || undefined,
        groupIds: formData.groupIds,
        newGroupName: formData.newGroupName || undefined,
        memoAppointment: formData.memoAppointment,
        memoPersonal: formData.memoPersonal,
        memoHistory: formData.memoHistory,
        memoPrecautions: formData.memoPrecautions
      });
    }
    resetView();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetView}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[60]"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-[70] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white font-outfit">
                  {view === "selection" ? "관계 추가하기" : view === "manual" ? (selectedNodeId ? "정보 수정하기" : "직접 작성하기") : "프로필"}
                </h2>
                {view === "profile" && (
                  <button 
                    onClick={() => setView("manual")}
                    className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    수정
                  </button>
                )}
              </div>
              <button
                onClick={resetView}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {view === "selection" ? (
                <div className="grid gap-4">
                  <SidebarButton icon={<MessageSquare className="w-5 h-5" />} label="카카오톡 대화 불러오기" onClick={() => {}} />
                  <SidebarButton icon={<Mic className="w-5 h-5" />} label="녹음 불러오기" onClick={() => {}} />
                  <SidebarButton icon={<Camera className="w-5 h-5" />} label="Instagram DM 불러오기" onClick={() => {}} />
                  <SidebarButton icon={<PenLine className="w-5 h-5" />} label="직접 작성하기" onClick={handleManualAdd} primary />
                </div>
              ) : view === "manual" ? (
                <ManualAddForm 
                  formData={formData} 
                  setFormData={setFormData} 
                  groups={groups || []} 
                  onDeleteGroup={onDeleteGroup} 
                  isUploading={isUploading}
                  onImageUpload={handleImageUpload}
                />
              ) : (
                <ProfileView 
                  node={nodes?.find(n => n.id === selectedNodeId)} 
                  groups={groups || []} 
                  onDisconnect={onDisconnect}
                  onDelete={onDelete}
                />
              )}
            </div>
            
            {view === "manual" && (
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                <button 
                  onClick={() => selectedNodeId ? setView("profile") : setView("selection")}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  이전으로
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!formData.name}
                  className="flex-[2] py-3 px-4 rounded-xl bg-brand-primary text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-blue-500/20"
                >
                  {selectedNodeId ? "수정 완료" : "추가 완료"}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SidebarButton({ icon, label, onClick, primary = false }: { 
  icon: React.ReactNode; 
  label: string; 
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98] ${
        primary 
          ? "bg-brand-primary/5 border-brand-primary/30 text-brand-primary" 
          : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-sm"
      }`}
    >
      <div className={`p-2 rounded-xl ${primary ? "bg-brand-primary text-white" : "bg-slate-100 dark:bg-slate-700"}`}>
        {icon}
      </div>
      <span className="font-semibold text-sm">{label}</span>
    </button>
  );
}

const processImageToBlob = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas to Blob conversion failed"));
            }
          },
          "image/webp",
          0.8
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
};

function ManualAddForm({ formData, setFormData, groups, onDeleteGroup, isUploading, onImageUpload }: { formData: any; setFormData: any; groups: GroupData[]; onDeleteGroup?: (id: string) => void; isUploading: boolean; onImageUpload: (file: File) => void }) {
  return (
    <div className="space-y-6">
      {/* Top Section: Photo and Basic Info */}
      <div className="flex gap-6 items-stretch">
        {/* Photo area */}
        <div className="w-1/2 flex flex-col justify-start">
          <label 
            className="w-full relative flex flex-col items-center justify-center gap-2 group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-brand-primary transition-colors bg-slate-50 dark:bg-slate-800/50"
            style={{ minHeight: (formData.photo && !isUploading) ? 'auto' : '150px' }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={async (e) => {
              e.preventDefault(); e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/') && !isUploading) {
                onImageUpload(file);
              }
            }}
          >
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              disabled={isUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file && !isUploading) {
                  onImageUpload(file);
                }
              }} 
            />
            {isUploading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-4">
                <div className="w-8 h-8 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin"></div>
                <span className="text-[10px] font-bold text-brand-primary animate-pulse">업로드 중...</span>
              </div>
            ) : formData.photo ? (
              <img src={formData.photo} alt="Profile" className="w-full h-auto object-contain max-h-[160px]" />
            ) : (
              <>
                <Camera className="w-8 h-8 text-slate-400 group-hover:text-brand-primary transition-colors" />
                <span className="text-[10px] font-medium text-slate-500">사진 추가</span>
              </>
            )}
          </label>
        </div>

        {/* Basic Fields */}
        <div className="flex-1 flex flex-col justify-between space-y-3">
          <InputField 
            label="이름" 
            placeholder="홍길동" 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
          />
          <InputField 
            label="나이" 
            placeholder="25" 
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
          />
          <InputField 
            label="학과/직업" 
            placeholder="컴퓨터공학" 
            value={formData.job}
            onChange={(e) => setFormData({ ...formData, job: e.target.value })}
          />
          <MultiSelectGroupField 
            label="그룹 (최대 3개, 우클릭으로 삭제)"
            selectedIds={formData.groupIds}
            onChange={(ids) => setFormData({ ...formData, groupIds: ids })}
            groups={groups || []}
            onDeleteGroup={onDeleteGroup}
            newGroupName={formData.newGroupName}
            onNewGroupNameChange={(val) => setFormData({ ...formData, newGroupName: val })}
          />
          <InputField 
            label="관계" 
            placeholder="고등학교 친구" 
            value={formData.relation}
            onChange={(e) => setFormData({ ...formData, relation: e.target.value })}
          />
        </div>
      </div>

      {/* Bottom Section: Detailed Info */}
      <div className="space-y-4">
        <TextAreaField 
          label="약속" 
          placeholder="자주 만나는 장소, 시간 등" 
          value={formData.memoAppointment} 
          onChange={(val) => setFormData({ ...formData, memoAppointment: val })}
        />
        <TextAreaField 
          label="개인" 
          placeholder="성격, 취미, 생일 등" 
          value={formData.memoPersonal} 
          onChange={(val) => setFormData({ ...formData, memoPersonal: val })}
        />
        <TextAreaField 
          label="나와" 
          placeholder="함께한 추억, 현재 관계 등" 
          value={formData.memoHistory} 
          onChange={(val) => setFormData({ ...formData, memoHistory: val })}
        />
        <TextAreaField 
          label="조심해야 할 점" 
          placeholder="못 먹는 음식, 싫어하는 것 등" 
          value={formData.memoPrecautions} 
          onChange={(val) => setFormData({ ...formData, memoPrecautions: val })}
        />
      </div>
    </div>
  );
}

function MultiSelectGroupField({ label, selectedIds = [], onChange, groups, onDeleteGroup, newGroupName, onNewGroupNameChange }: { label: string; selectedIds: string[]; onChange: (ids: string[]) => void; groups: GroupData[]; onDeleteGroup?: (id: string) => void; newGroupName: string; onNewGroupNameChange: (val: string) => void }) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setConfirmDeleteId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const toggleGroup = (id: string) => {
    const ids = selectedIds || [];
    if (ids.includes(id)) {
      onChange(ids.filter(sid => sid !== id));
    } else {
      if (ids.length < 3) {
        onChange([...ids, id]);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const safeSelectedIds = selectedIds || [];

  return (
    <div className="space-y-2 relative">
      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 ml-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {groups.map(g => (
          <button
            key={g.id}
            type="button"
            onClick={() => toggleGroup(g.id)}
            onContextMenu={(e) => handleContextMenu(e, g.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              safeSelectedIds.includes(g.id)
                ? "bg-brand-primary text-white border-brand-primary shadow-sm"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-slate-300"
            }`}
            style={safeSelectedIds.includes(g.id) ? { backgroundColor: g.color, borderColor: g.color } : {}}
          >
            {g.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowNewInput(!showNewInput)}
          className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all border border-dashed ${
            showNewInput 
              ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300" 
              : "text-brand-primary border-brand-primary/30 hover:bg-brand-primary/5"
          }`}
        >
          {showNewInput ? "취소" : "+ 그룹 추가"}
        </button>
      </div>
      
      {showNewInput && (
        <input
          type="text"
          placeholder="새 그룹 이름 입력 후 저장"
          value={newGroupName}
          onChange={(e) => onNewGroupNameChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
        />
      )}

      {/* Context Menu Popup */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 100 }}
            className="bg-white dark:bg-slate-800 shadow-2xl border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden py-1 min-w-[120px]"
          >
            {confirmDeleteId === contextMenu.id ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteGroup?.(contextMenu.id);
                  setContextMenu(null);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 w-full text-left font-bold transition-colors"
              >
                정말 삭제할까요?
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(contextMenu.id);
                }}
                className="px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 w-full text-left font-bold transition-colors"
              >
                그룹 삭제
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InputField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 ml-1">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
      />
    </div>
  );
}

function TextAreaField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (val: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 ml-1">{label}</label>
      <textarea
        placeholder={placeholder}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 resize-none text-slate-700 dark:text-slate-200"
      />
    </div>
  );
}

function ProfileView({ node, groups, onDisconnect, onDelete }: { node?: NodeData; groups: GroupData[]; onDisconnect?: (id: string) => void; onDelete?: (id: string) => void }) {
  if (!node) return <div className="text-center text-slate-500 mt-10">정보를 찾을 수 없습니다.</div>;

  const nodeGroupIds = node.groupIds || (node.groupId ? [node.groupId] : []);
  const nodeGroups = nodeGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean) as GroupData[];

  // 탭 상태 및 사용자 데이터 상태
  const [activeTab, setActiveTab] = useState<"info" | "activities">("info");
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(false);

  // 활동 추가 폼 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [activityName, setActivityName] = useState(""); // [NEW] 만남 이름 상태
  const [actType, setActType] = useState<"offline" | "online" | "contact">("offline");
  const [participantsCount, setParticipantsCount] = useState(2);
  const [duration, setDuration] = useState(1.0);
  const [isPrivate, setIsPrivate] = useState(true);
  const [initiatedByMe, setInitiatedByMe] = useState(false);
  const [noResponse30m, setNoResponse30m] = useState(false);
  const [activityDate, setActivityDate] = useState(new Date().toISOString().substring(0, 10));
  const [confirmType, setConfirmType] = useState<"none" | "disconnect" | "delete">("none");

  // [NEW] 파일 첨부 상태 및 라이트박스 뷰어 상태
  const [attachedFiles, setAttachedFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // [NEW] 이미지 압축 및 대화록 리더 연동
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttached: any[] = [];

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
        console.error("파일 처리 실패:", file.name, err);
      }
    }

    setAttachedFiles(prev => [...prev, ...newAttached]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // 유저 ID 및 활동 목록 불러오기
  useEffect(() => {
    const loadUserAndData = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const list = await fetchActivities(user.id, node.id);
          setActivities(list);
        }
      } catch (err) {
        console.error("활동 데이터 조회 실패:", err);
      } finally {
        setLoading(false);
      }
    };

    if (node?.id) {
      loadUserAndData();
      setActiveTab("info");
      setShowAddForm(false);
      setConfirmType("none");
      setAttachedFiles([]);
      setActivityName(""); // [NEW] 초기화
    }
  }, [node?.id]);

  // 활동 저장 핸들러
  const handleSaveActivity = async () => {
    if (!userId || !node.id) return;

    try {
      // [NEW] 만남 이름 계산
      const finalName = activityName.trim() || `${activityDate} ${
        actType === "offline" 
          ? "오프라인 만남" 
          : actType === "online" 
            ? "온라인 소통" 
            : "연락 소통"
      }`;

      const activityData: Omit<ActivityData, "user_id"> = {
        node_id: node.id,
        activity_name: finalName, // [NEW] 이름 추가
        activity_type: actType,
        participants_count: Number(participantsCount),
        duration: Number(duration),
        is_private: isPrivate,
        initiated_by_me: isPrivate ? initiatedByMe : false,
        no_response_30m: noResponse30m,
        activity_date: new Date(activityDate).toISOString(),
        files: attachedFiles // [NEW] 첨부파일 전달
      };

      const saved = await addActivity(userId, activityData);
      setActivities(prev => [saved, ...prev]);
      setShowAddForm(false);

      // 입력 필드 리셋
      setActivityName(""); // [NEW] 초기화
      setActType("offline");
      setParticipantsCount(2);
      setDuration(1.0);
      setIsPrivate(true);
      setInitiatedByMe(false);
      setNoResponse30m(false);
      setActivityDate(new Date().toISOString().substring(0, 10));
      setAttachedFiles([]); // [NEW] 파일 초기화
    } catch (err) {
      console.error("활동 등록 중 에러:", err);
    }
  };

  // 활동 삭제 핸들러
  const handleDeleteActivity = async (id: string) => {
    if (!userId || !node.id || !id) return;
    if (confirm("정말 이 활동 기록을 삭제하시겠습니까?")) {
      const success = await deleteActivity(userId, node.id, id);
      if (success) {
        setActivities(prev => prev.filter(a => a.id !== id));
      }
    }
  };

  const handleDisconnect = () => {
    if (confirmType !== "disconnect") {
      setConfirmType("disconnect");
      return;
    }
    onDisconnect?.(node.id);
    setConfirmType("none");
  };

  const handleDelete = () => {
    if (confirmType !== "delete") {
      setConfirmType("delete");
      return;
    }
    onDelete?.(node.id);
    setConfirmType("none");
  };

  // 친밀도 및 거리 점수 연산
  const score = calculateIntimacyScore(activities);
  const distance = calculateDistance(score);
  const intimacyPercent = Math.round(((300 - distance) / 180) * 100);

  // 게이지 스타일 정의
  let levelText = "소원한 관계";
  let levelColor = "text-slate-500 bg-slate-100 dark:bg-slate-800/80";
  let progressColor = "bg-slate-400";
  if (intimacyPercent >= 80) {
    levelText = "매우 깊은 관계 (절친) ❤️";
    levelColor = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20";
    progressColor = "bg-gradient-to-r from-emerald-400 to-teal-500";
  } else if (intimacyPercent >= 40) {
    levelText = "친밀하고 따뜻한 친구 😊";
    levelColor = "text-blue-600 bg-blue-50 dark:bg-blue-950/20";
    progressColor = "bg-gradient-to-r from-blue-400 to-indigo-500";
  } else if (intimacyPercent >= 10) {
    levelText = "알아가는 관계 (보통) 🌱";
    levelColor = "text-amber-600 bg-amber-50 dark:bg-amber-950/20";
    progressColor = "bg-gradient-to-r from-amber-400 to-orange-400";
  }

  return (
    <div className="flex flex-col items-center mt-6">
      {/* Profile Header Card */}
      <div className="flex items-center gap-6 mb-6 w-full px-2">
        <div 
          className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center shadow-xl relative overflow-hidden p-1 shrink-0"
          style={(() => {
            if (nodeGroups.length === 0) return { border: '4px solid white' };
            if (nodeGroups.length === 1) return { border: `4px solid ${nodeGroups[0].color}` };
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
            {node.photo ? (
              <img src={node.photo} alt={node.name} className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-8 h-8 text-slate-300 dark:text-slate-500" />
            )}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1 truncate">{node.name}</h3>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {node.age ? `${node.age}세` : "나이 미입력"} · {node.job || "직업 미입력"}
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {nodeGroups.map(g => (
                <div 
                  key={g.id}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: g.color }}
                >
                  {g.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-4 w-full">
        <div className="px-4 py-1.5 bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold w-full text-center border border-brand-primary/20">
          관계: {node.relation || "관계 정보 없음"}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 w-full mb-6 mt-2">
        <button
          onClick={() => setActiveTab("info")}
          className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 text-center ${
            activeTab === "info"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600"
          }`}
        >
          기본 정보
        </button>
        <button
          onClick={() => setActiveTab("activities")}
          className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 text-center flex items-center justify-center gap-1.5 ${
            activeTab === "activities"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600"
          }`}
        >
          소통 기록
          {activities.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-[10px] font-bold text-brand-primary">
              {activities.length}
            </span>
          )}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "info" ? (
        <div className="w-full space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 mb-2">약속</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">
              {node.memoAppointment || "기록된 약속 정보가 없습니다."}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 mb-2">개인</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">
              {node.memoPersonal || "기록된 개인 정보가 없습니다."}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 mb-2">나와</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">
              {node.memoHistory || "기록된 내용이 없습니다."}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 mb-2">조심해야 할 점</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">
              {node.memoPrecautions || "기록된 내용이 없습니다."}
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full space-y-6">
          {/* 친밀도 계기판 카드 */}
          <div className="bg-slate-50 dark:bg-slate-850 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full filter blur-xl"></div>
            
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">인물 친밀 점수</span>
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white font-outfit leading-none">
                  {score.toFixed(2)} <span className="text-xs font-normal text-slate-400">점</span>
                </span>
              </div>
              <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${levelColor}`}>
                {levelText}
              </div>
            </div>

            {/* 게이지 바 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500">
                <span>친밀도 게이지 ({intimacyPercent}%)</span>
                <span>배치 반경: {distance}px</span>
              </div>
              <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ease-out ${progressColor}`}
                  style={{ width: `${intimacyPercent}%` }}
                />
              </div>
            </div>
            
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
              * 소통 활동 빈도, 지속시간, 소통 질을 분석하여 거리를 결정합니다. '관계도 자동 정렬' 클릭 시 마인드맵에 중심부로 이끌립니다.
            </p>
          </div>

          {/* 소통 기록 추가 폼 */}
          <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/50 shadow-sm transition-all duration-300">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="w-full p-4 flex items-center justify-between font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Plus className="w-4 h-4" />
                </div>
                <span>소통 활동 기록 추가</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${showAddForm ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showAddForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="px-4 pb-5 border-t border-slate-100 dark:border-slate-800 space-y-4 pt-4 text-left overflow-hidden"
                >
                  {/* [NEW] 만남 이름 입력 */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 ml-0.5">만남 이름</label>
                    <input
                      type="text"
                      placeholder="예: 삼겹살 회식 🥓, 커피챗 ☕"
                      value={activityName}
                      onChange={(e) => setActivityName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 font-semibold"
                    />
                  </div>

                  {/* 소통 방식 선택 */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">활동 분류</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["offline", "online", "contact"] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setActType(type);
                            // 연락은 기본으로 30분(0.5시간) 추천, 미팅은 1시간 추천
                            setDuration(type === "contact" ? 0.5 : 1.0);
                          }}
                          className={`py-2 px-1 text-center font-bold text-[11px] rounded-xl border flex flex-col items-center gap-1 transition-all ${
                            actType === type
                              ? "bg-brand-primary border-brand-primary text-white shadow-md shadow-blue-500/10 scale-105"
                              : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                          }`}
                        >
                          {type === "offline" && <Users className="w-3.5 h-3.5" />}
                          {type === "online" && <Mic className="w-3.5 h-3.5" />}
                          {type === "contact" && <MessageSquare className="w-3.5 h-3.5" />}
                          <span>
                            {type === "offline" ? "오프라인" : type === "online" ? "온라인 소통" : "메시지 연락"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 수치 데이터 입력 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">소통 인원 (명수)</label>
                      <input
                        type="number"
                        min={2}
                        value={participantsCount}
                        onChange={(e) => setParticipantsCount(Math.max(2, Number(e.target.value)))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      />
                      {participantsCount === 2 && (
                        <span className="text-[8px] text-emerald-500 font-bold block mt-0.5">1:1 소통 (+1.5배 보너스!)</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">지속 시간 (시간)</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={duration}
                        onChange={(e) => setDuration(Math.max(0.1, Number(e.target.value)))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      />
                    </div>
                  </div>

                  {/* 성격 (사적 vs 공적) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">대화 성격</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPrivate(true)}
                        className={`py-2 px-3 text-center text-xs font-bold rounded-lg border transition-all ${
                          isPrivate
                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700"
                        }`}
                      >
                        사적인 대화 (기본 3점)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsPrivate(false);
                          setInitiatedByMe(false);
                        }}
                        className={`py-2 px-3 text-center text-xs font-bold rounded-lg border transition-all ${
                          !isPrivate
                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700"
                        }`}
                      >
                        공적인 업무 (기본 1점)
                      </button>
                    </div>
                  </div>

                  {/* 추가 가중치 체크박스 */}
                  <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    {isPrivate && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={initiatedByMe}
                          onChange={(e) => setInitiatedByMe(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-700 text-brand-primary focus:ring-brand-primary"
                        />
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">내가 먼저 선톡/제안했음 (+1점 추가!)</span>
                      </label>
                    )}
                    
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={noResponse30m}
                        onChange={(e) => setNoResponse30m(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-700 text-brand-primary focus:ring-brand-primary"
                      />
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">상대방이 30분 이상 무응답/지연 (-0.5점 감점)</span>
                    </label>
                  </div>

                  {/* 활동 날짜 */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">활동 날짜</label>
                    <input
                      type="date"
                      value={activityDate}
                      onChange={(e) => setActivityDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* [NEW] 파일 첨부 영역 */}
                  <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block">대화 사진 및 내용 파일 첨부</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3.5 border border-dashed border-slate-200 dark:border-slate-800 hover:border-brand-primary rounded-xl flex flex-col items-center justify-center gap-1 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-50 transition-all cursor-pointer text-center"
                    >
                      <Upload className="w-5 h-5 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">여기를 클릭하여 파일 첨부</span>
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
                      <span className="text-[9px] font-bold text-brand-primary animate-pulse block text-center mt-1">파일 압축 변환 중...</span>
                    )}
                    {attachedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {attachedFiles.map((file, idx) => (
                          <div 
                            key={idx}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-1.5 max-w-[150px] relative group"
                          >
                            <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[90px]">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="text-slate-400 hover:text-red-500 shrink-0 cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 등록 버튼 */}
                  <button
                    type="button"
                    onClick={handleSaveActivity}
                    className="w-full py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold hover:opacity-90 shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    활동 기록 저장
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 소통 기록 리스트 */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <span>최신 소통 리스트</span>
              {activities.length > 0 && <span className="text-[10px] text-slate-400">({activities.length}개)</span>}
            </h4>

            {loading ? (
              <div className="text-center py-6 text-slate-400 text-xs">활동 정보를 조회 중입니다...</div>
            ) : activities.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <Sparkles className="w-5 h-5 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">등록된 소통 활동이 없습니다.</p>
                <p className="text-[10px] text-slate-400/80 mt-1">소통 기록을 추가해 친밀도를 쌓아보세요!</p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {activities.map((act) => {
                  const itemScore = calculateActivityScore(act);
                  
                  return (
                    <div 
                      key={act.id} 
                      className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 group/item hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* 아이콘 */}
                        <div className={`p-2 rounded-xl shrink-0 ${
                          act.activity_type === "offline" 
                            ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                            : act.activity_type === "online"
                            ? "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                            : "bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
                        }`}>
                          {act.activity_type === "offline" && <Users className="w-4 h-4" />}
                          {act.activity_type === "online" && <Mic className="w-4 h-4" />}
                          {act.activity_type === "contact" && <MessageSquare className="w-4 h-4" />}
                        </div>

                        {/* 상세 설명 */}
                        <div className="min-w-0 text-left">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]" title={act.activity_name}>
                              {act.activity_name || (act.activity_type === "offline" ? "오프라인 만남" : act.activity_type === "online" ? "온라인 소통" : "연락 세션")}
                            </span>
                            <span className="text-[9px] text-slate-400 font-semibold font-outfit">
                              {new Date(act.activity_date).toISOString().substring(0, 10)}
                            </span>
                          </div>
                          
                          {/* 세부 배지 */}
                          <div className="flex flex-wrap gap-1 mt-1 text-[8px] font-bold text-slate-400 dark:text-slate-500">
                            <span>{act.participants_count === 2 ? "1:1 대화" : `${act.participants_count}명`}</span>
                            <span>·</span>
                            <span>{act.duration}시간</span>
                            <span>·</span>
                            <span className={act.is_private ? "text-slate-500" : "text-amber-500"}>{act.is_private ? "사적" : "공적"}</span>
                            {act.initiated_by_me && (
                              <>
                                <span>·</span>
                                <span className="text-brand-primary">내가 선제안</span>
                              </>
                            )}
                            {act.no_response_30m && (
                              <>
                                <span>·</span>
                                <span className="text-red-500">응답없음</span>
                              </>
                            )}
                          </div>

                          {/* [NEW] 첨부 파일 리스트 렌더링 */}
                          {act.files && act.files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {act.files.map((file, fIdx) => (
                                <div key={fIdx} className="relative shrink-0">
                                  {file.type === "image" ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedPhotoUrl(file.url)}
                                      className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:scale-105 active:scale-95 transition-all block cursor-pointer"
                                    >
                                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                    </button>
                                  ) : (
                                    <a
                                      href={file.url}
                                      download={file.name}
                                      className="h-10 px-2 rounded-lg border border-slate-200/50 dark:border-slate-700 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-[8px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3 text-slate-400" />
                                      <span className="max-w-[50px] truncate">{file.name}</span>
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 점수 & 삭제 버튼 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-extrabold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full font-outfit">
                          +{itemScore.toFixed(1)}점
                        </span>
                        
                        <button
                          onClick={() => handleDeleteActivity(act.id!)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 노드 분리/삭제 푸터 버튼 (정렬 고정) */}
      <div className="w-full mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
        {confirmType === "disconnect" && (
          <p className="text-xs font-bold text-red-500 text-center mb-1 animate-pulse">정말 연결을 끊으시겠습니까? 다시 한번 눌러주세요.</p>
        )}
        <button 
          onClick={handleDisconnect}
          onMouseLeave={() => confirmType === "disconnect" && setConfirmType("none")}
          className={`w-full py-3 px-4 rounded-xl border font-semibold transition-all ${
            confirmType === "disconnect" 
              ? "bg-red-500 text-white border-red-500 scale-[1.02]" 
              : "border-red-200 dark:border-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
          }`}
        >
          {confirmType === "disconnect" ? "연결 끊기 확인" : "연결 끊기"}
        </button>

        {confirmType === "delete" && (
          <p className="text-xs font-bold text-red-600 text-center mb-1 animate-pulse">정말 노드를 삭제하시겠습니까? 다시 한번 눌러주세요.</p>
        )}
        <button 
          onClick={handleDelete}
          onMouseLeave={() => confirmType === "delete" && setConfirmType("none")}
          className={`w-full py-3 px-4 rounded-xl font-semibold transition-all shadow-lg ${
            confirmType === "delete"
              ? "bg-red-700 text-white shadow-red-900/20 scale-[1.02]"
              : "bg-red-500 text-white hover:bg-red-600 shadow-red-500/20"
          }`}
        >
          {confirmType === "delete" ? "노드 삭제 확인" : "노드 삭제"}
        </button>

        {confirmType !== "none" && (
          <button 
            onClick={() => setConfirmType("none")}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            취소
          </button>
        )}
      </div>

      {/* [NEW] 라이트박스 이미지 뷰어 모달 */}
      <AnimatePresence>
        {selectedPhotoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setSelectedPhotoUrl(null)}
          >
            <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <img src={selectedPhotoUrl} alt="확대 이미지" className="max-w-full max-h-[80vh] object-contain" />
              <button
                type="button"
                onClick={() => setSelectedPhotoUrl(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ChevronDownIcon 헬퍼 컴포넌트 추가
function ChevronDownIcon({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <svg 
      className={className} 
      onClick={onClick}
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
