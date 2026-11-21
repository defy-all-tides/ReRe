import { supabase } from "./supabaseClient";

export interface ActivityFile {
  name: string;
  type: "image" | "document";
  size: number;
  url: string; // 압축된 Base64 데이터 URL
}

export interface ActivityData {
  id?: string;
  user_id?: string;
  node_id: string;
  activity_name?: string; // [NEW] 커스텀 만남 이름
  activity_type: "offline" | "online" | "contact";
  participants_count: number; // '명수'
  duration: number; // '지속시간' (in hours, e.g. 1.5)
  is_private: boolean; // '사적/공적' (true for 사적, false for 공적)
  initiated_by_me: boolean; // '선톡/선제안 여부'
  no_response_30m: boolean; // '30분 이상 무응답 여부'
  activity_date: string; // '날짜' (ISO String or YYYY-MM-DD)
  files?: ActivityFile[]; // [NEW] 첨부파일 목록 (JSONB 컬럼)
  created_at?: string;
}

/**
 * HTML5 Canvas를 이용해 이미지를 최대 800px 해상도로 리사이징하고 JPEG 75% 압축률로 다운샘플링하여 초경량 Base64로 반환합니다.
 * 이를 통해 5MB 이상의 대용량 원본 사진을 80~120KB 수준으로 줄여 LocalStorage 및 Supabase JSONB에 초고속으로 동기화합니다.
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
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
        if (!ctx) {
          resolve(event.target?.result as string); // 캔버스 컨텍스트 에러 시 원본 리턴
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // JPEG 포맷, 품질 0.75 압축 실행
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * 텍스트 대화록 파일(.txt) 등을 브라우저에서 Base64 Data URL로 인코딩하여 저장 및 복원이 가능하도록 리드합니다.
 */
export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
  });
}

/**
 * 1. 개별 소통 활동의 점수를 산출합니다.
 * - 오프라인 만남: 4점 / 명수
 * - 온라인 만남: 4점 / 명수
 * - 연락: 2점 / 명수
 * - 질 점수: 공적 1점, 사적 3점
 *   - 사적 + 선톡/선제안: +1점
 *   - 30분 이상 무응답: -0.5점
 *   - 1:1 소통인 경우 질 점수 1.5배 적용
 * - 최종 점수 = 기본점수 * 지속시간 * 질점수
 */
export function calculateActivityScore(activity: ActivityData): number {
  const N = activity.participants_count || 2; // 최소 2명 (나 + 상대)

  // 1) 기본 점수 (B)
  let B = 2 / N; // 연락
  if (activity.activity_type === "offline" || activity.activity_type === "online") {
    B = 4 / N;
  }

  // 2) 질 점수 (Q)
  const Q_base = activity.is_private ? 3 : 1;
  const P_init = (activity.is_private && activity.initiated_by_me) ? 1 : 0;
  const P_delay = activity.no_response_30m ? -0.5 : 0;

  let Q = Q_base + P_init + P_delay;

  // 1:1 만남일 경우 질 점수 1.5배 적용
  if (N === 2) {
    Q = Q * 1.5;
  }

  Q = Math.max(0, Q); // 혹시 모를 음수 점수 방지 안전장치

  // 3) 활동 점수 = 기본 점수 * 지속시간 * 질 점수
  return B * activity.duration * Q;
}

/**
 * 2. 특정 노드의 전체 활동 기록을 받아 최종 친밀도 점수를 계산합니다.
 * - 지난 한 달 간 점수 = log(1 + 지난 한 달 간 횟수 * 지속시간 * 질 점수)
 * - 총 점수 = sum(한 달 간 점수 * 0.9^(지난 개월 수))
 */
export function calculateIntimacyScore(activities: ActivityData[]): number {
  if (!activities || activities.length === 0) return 0;

  const now = new Date();
  const MS_IN_DAY = 24 * 60 * 60 * 1000;
  
  // 개월 수별 활동 에너지 점수의 단순 합을 저장하는 객체
  const monthlyActivitySums: Record<number, number> = {};

  activities.forEach(act => {
    const actDate = new Date(act.activity_date);
    const diffMs = now.getTime() - actDate.getTime();
    const diffDays = Math.max(0, diffMs / MS_IN_DAY);
    const monthsAgo = Math.floor(diffDays / 30);

    // 연산 최적화를 위해 12개월(1년) 이전의 소통은 비중이 극히 낮으므로 제외 (0.9^12 ≈ 0.28)
    if (monthsAgo >= 12) return;

    const score = calculateActivityScore(act);
    monthlyActivitySums[monthsAgo] = (monthlyActivitySums[monthsAgo] || 0) + score;
  });

  // 감쇠 공식 적용: 총 점수 = sum( log(1 + 월별활동점수합) * 0.9^(monthsAgo) )
  let totalScore = 0;
  for (let m = 0; m < 12; m++) {
    const monthlySum = monthlyActivitySums[m] || 0;
    if (monthlySum > 0) {
      const monthlyScore = Math.log(1 + monthlySum);
      totalScore += monthlyScore * Math.pow(0.9, m);
    }
  }

  return parseFloat(totalScore.toFixed(3));
}

/**
 * 3. 최종 친밀도 점수를 마인드맵 배치 반경(거리)으로 변환합니다.
 * - 점수가 높을수록 가깝게 배치 (최대 가깝게 120px)
 * - 점수가 낮거나 소원한 경우 멀리 배치 (최대 멀리 300px)
 */
export function calculateDistance(score: number): number {
  // Radius = 120 + 180 / (1 + 0.5 * score)
  return Math.round(120 + 180 / (1 + 0.5 * score));
}

/* =========================================================================
   Supabase DB & LocalStorage 동기화 CRUD 작업
   ========================================================================= */

// 로컬 스토리지에 데이터를 저장할 때 base64 대용량 이미지 주소를 소멸시켜 용량을 99.9% 압축하는 안전 도구
function cleanActivitiesForLocal(activities: ActivityData[]): ActivityData[] {
  return activities.map(act => {
    if (!act.files || act.files.length === 0) return act;
    return {
      ...act,
      files: act.files.map(file => ({
        ...file,
        url: "" // base64 데이터 URL을 제거하여 LocalStorage 용량 쿼터 초과를 영구 차단!
      }))
    };
  });
}

// 안전한 setItem 래퍼 함수 (예외를 완전히 차단)
function safeSetItem(key: string, value: string) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn(`⚠️ LocalStorage 저장 제한 초과 (키: ${key}):`, err);
  }
}

// 로컬 스토리지 헬퍼 함수
function getActivitiesFromLocal(userId: string, nodeId: string): ActivityData[] {
  if (typeof window === "undefined") return [];
  const key = `mindmap_activities_${userId}_${nodeId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function saveActivitiesToLocal(userId: string, nodeId: string, activities: ActivityData[]) {
  if (typeof window === "undefined") return;
  const key = `mindmap_activities_${userId}_${nodeId}`;
  const cleaned = cleanActivitiesForLocal(activities);
  safeSetItem(key, JSON.stringify(cleaned));
}

/**
 * 특정 인물 노드와의 모든 소통 기록 조회
 */
export async function fetchActivities(userId: string, nodeId: string): Promise<ActivityData[]> {
  try {
    const { data, error } = await supabase
      .from("mindmap_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("node_id", nodeId)
      .order("activity_date", { ascending: false });

    if (error) throw error;

    // 성공 시 로컬 스토리지 백업 동기화
    saveActivitiesToLocal(userId, nodeId, data || []);
    return data || [];
  } catch (err) {
    console.warn("⚠️ fetchActivities DB 조회 실패 (로컬 스토리지 백업본 로드):", err);
    return getActivitiesFromLocal(userId, nodeId);
  }
}

/**
 * 전체 인물 노드의 소통 기록을 한 번에 조회 (자동 정렬 대량 연산용)
 */
export async function fetchAllActivities(userId: string): Promise<ActivityData[]> {
  try {
    const { data, error } = await supabase
      .from("mindmap_activities")
      .select("*")
      .eq("user_id", userId)
      .order("activity_date", { ascending: false });

    if (error) throw error;

    if (data && typeof window !== "undefined") {
      // 전체 캐시 저장 (압축하여 안전하게 저장)
      const cleaned = cleanActivitiesForLocal(data);
      safeSetItem(`mindmap_activities_all_${userId}`, JSON.stringify(cleaned));

      // 각 노드별로 그룹핑하여 개별 로컬 스토리지 키 분할 백업
      const grouped: Record<string, ActivityData[]> = {};
      data.forEach(act => {
        grouped[act.node_id] = grouped[act.node_id] || [];
        grouped[act.node_id].push(act);
      });

      // 기존 캐시 갱신
      Object.entries(grouped).forEach(([nid, list]) => {
        saveActivitiesToLocal(userId, nid, list);
      });
    }

    return data || [];
  } catch (err) {
    console.warn("⚠️ fetchAllActivities DB 조회 실패 (로컬 전체 캐시 로드):", err);
    if (typeof window !== "undefined") {
      const allCache = localStorage.getItem(`mindmap_activities_all_${userId}`);
      return allCache ? JSON.parse(allCache) : [];
    }
    return [];
  }
}

/**
 * 새로운 소통 활동 추가
 */
export async function addActivity(userId: string, activity: Omit<ActivityData, "user_id">): Promise<ActivityData> {
  const newActivity: ActivityData = {
    ...activity,
    user_id: userId,
    id: activity.id || Math.random().toString(36).substring(2, 11),
  };

  // 1) 즉각 반응성을 위해 로컬 스토리지 선반영
  const localActs = getActivitiesFromLocal(userId, activity.node_id);
  const updatedLocal = [newActivity, ...localActs];
  saveActivitiesToLocal(userId, activity.node_id, updatedLocal);

  // 전체 캐시도 동기화 (압축 및 안전 저장)
  if (typeof window !== "undefined") {
    const allCacheStr = localStorage.getItem(`mindmap_activities_all_${userId}`);
    const allCache: ActivityData[] = allCacheStr ? JSON.parse(allCacheStr) : [];
    const cleanedList = cleanActivitiesForLocal([newActivity, ...allCache]);
    safeSetItem(`mindmap_activities_all_${userId}`, JSON.stringify(cleanedList));
  }

  try {
    // 2) Supabase 디비 연동 (대용량 base64 데이터는 documents 버킷에 업로드 후 Public URL로 교환 보관)
    const finalFiles = await uploadFilesToStorageIfNeeded(newActivity.files);

    const { data, error } = await supabase
      .from("mindmap_activities")
      .insert({
        id: newActivity.id,
        user_id: userId,
        node_id: newActivity.node_id,
        activity_name: newActivity.activity_name || null, // [NEW] 커스텀 만남 이름
        activity_type: newActivity.activity_type,
        participants_count: newActivity.participants_count,
        duration: newActivity.duration,
        is_private: newActivity.is_private,
        initiated_by_me: newActivity.initiated_by_me,
        no_response_30m: newActivity.no_response_30m,
        activity_date: newActivity.activity_date,
        files: finalFiles // [NEW] 파일 저장
      })
      .select();

    if (error) throw error;

    // 디비에서 성공적으로 반환되면 정확한 데이터로 로컬 스토리지 데이터 교체
    if (data && data[0]) {
      const cleanLocal = [data[0], ...localActs.filter(a => a.id !== newActivity.id)];
      saveActivitiesToLocal(userId, activity.node_id, cleanLocal);
      return data[0];
    }
  } catch (err) {
    console.warn("⚠️ Supabase 활동 등록 실패 (로컬 스토리지에 임시 단독 보존 및 files 연동 대기):", err);
  }

  return newActivity;
}

/**
 * 소통 활동 삭제
 */
export async function deleteActivity(userId: string, nodeId: string, activityId: string): Promise<boolean> {
  // 1) 로컬 스토리지 선반영
  const localActs = getActivitiesFromLocal(userId, nodeId);
  const updatedLocal = localActs.filter(a => a.id !== activityId);
  saveActivitiesToLocal(userId, nodeId, updatedLocal);

  // 전체 캐시도 동기화 (압축 및 안전 저장)
  if (typeof window !== "undefined") {
    const allCacheStr = localStorage.getItem(`mindmap_activities_all_${userId}`);
    const allCache: ActivityData[] = allCacheStr ? JSON.parse(allCacheStr) : [];
    const cleanedList = cleanActivitiesForLocal(allCache.filter(a => a.id !== activityId));
    safeSetItem(`mindmap_activities_all_${userId}`, JSON.stringify(cleanedList));
  }

  try {
    // 2) Supabase 디비 반영
    const { error } = await supabase
      .from("mindmap_activities")
      .delete()
      .eq("id", activityId)
      .eq("user_id", userId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("⚠️ Supabase 활동 삭제 실패 (로컬 상태는 선제적으로 반영됨):", err);
    return true; // 로컬에서 지웠으므로 성공으로 간주
  }
}

/**
 * 소통 활동 수정 (로컬 캐시 듀얼 키 자동 동기화 및 Supabase 연동)
 */
export async function updateActivity(
  userId: string,
  nodeId: string,
  activityId: string,
  updatedFields: Partial<Omit<ActivityData, "id" | "user_id" | "node_id">>
): Promise<ActivityData | null> {
  // 1) 로컬 스토리지 선반영 (개별 노드 캐시)
  const localActs = getActivitiesFromLocal(userId, nodeId);
  let updatedObj: ActivityData | null = null;
  
  const updatedLocal = localActs.map(act => {
    if (act.id === activityId) {
      updatedObj = { ...act, ...updatedFields };
      return updatedObj;
    }
    return act;
  });
  
  if (updatedLocal.length > 0) {
    saveActivitiesToLocal(userId, nodeId, updatedLocal);
  }

  // 전체 캐시도 동기화 (압축 및 안전 저장)
  if (typeof window !== "undefined") {
    const allCacheStr = localStorage.getItem(`mindmap_activities_all_${userId}`);
    const allCache: ActivityData[] = allCacheStr ? JSON.parse(allCacheStr) : [];
    const updatedAll = allCache.map(act => (act.id === activityId ? { ...act, ...updatedFields } : act));
    const cleanedList = cleanActivitiesForLocal(updatedAll);
    safeSetItem(`mindmap_activities_all_${userId}`, JSON.stringify(cleanedList));
  }

  try {
    // 2) Supabase 디비 연동 (대용량 base64 데이터는 documents 버킷에 업로드 후 Public URL로 교환 보관)
    let finalFields = { ...updatedFields };
    if (updatedFields.files) {
      const finalFiles = await uploadFilesToStorageIfNeeded(updatedFields.files);
      finalFields.files = finalFiles;
    }

    const { data, error } = await supabase
      .from("mindmap_activities")
      .update(finalFields)
      .eq("id", activityId)
      .eq("user_id", userId)
      .select();

    if (error) throw error;
    
    if (data && data[0]) {
      // 정확한 반환 값으로 로컬 캐시 재동기화
      const latestObj = data[0];
      const cleanLocal = localActs.map(act => (act.id === activityId ? latestObj : act));
      saveActivitiesToLocal(userId, nodeId, cleanLocal);
      
      // 전체 캐시도 최신 데이터로 재동기화 (압축 및 안전 저장)
      if (typeof window !== "undefined") {
        const allCacheStr = localStorage.getItem(`mindmap_activities_all_${userId}`);
        const allCache: ActivityData[] = allCacheStr ? JSON.parse(allCacheStr) : [];
        const updatedAll = allCache.map(act => (act.id === activityId ? latestObj : act));
        const cleanedList = cleanActivitiesForLocal(updatedAll);
        safeSetItem(`mindmap_activities_all_${userId}`, JSON.stringify(cleanedList));
      }
      
      return latestObj;
    }
  } catch (err) {
    console.warn("⚠️ Supabase 활동 수정 실패 (로컬 스토리지 선반영 유지):", err);
  }

  return updatedObj;
}

/* =========================================================================
   바이너리 스토리지 연동 유틸리티 & 마이그레이션 모듈
   ========================================================================= */

/**
 * base64 Data URL을 바이너리 Blob 객체로 변환합니다.
 */
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Supabase Storage의 동적 버킷에 파일을 업로드하고 Public URL을 반환합니다.
 */
export async function uploadToSupabaseStorage(
  bucketName: string,
  fileName: string,
  blobOrFile: Blob | File
): Promise<string | null> {
  try {
    const fileExt = blobOrFile.type.split("/")[1] || "bin";
    const uniqueName = `${Math.random().toString(36).substring(2, 11)}_${Date.now()}.${fileExt}`;
    const fullFileName = `${fileName}_${uniqueName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fullFileName, blobOrFile, {
        contentType: blobOrFile.type,
        cacheControl: "3600",
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fullFileName);

    return publicUrl;
  } catch (err) {
    console.error(`❌ Supabase Storage [${bucketName}] 업로드 오류:`, err);
    return null;
  }
}

/**
 * 활동의 파일 리스트 중 base64로 되어 있는 파일들을 Supabase Storage 'documents' 버킷으로 업로드하여 Public URL로 변경합니다.
 */
export async function uploadFilesToStorageIfNeeded(files: ActivityFile[] | undefined): Promise<ActivityFile[]> {
  if (!files || files.length === 0) return [];

  const processedFiles: ActivityFile[] = [];

  for (const file of files) {
    if (file.url && file.url.startsWith("data:")) {
      try {
        const blob = dataURLtoBlob(file.url);
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        // 특수문자나 한글 대응 안전 처리
        const safeName = encodeURIComponent(nameWithoutExt).replace(/%/g, "");
        const publicUrl = await uploadToSupabaseStorage("documents", `activity_${safeName}`, blob);
        
        if (publicUrl) {
          processedFiles.push({
            ...file,
            url: publicUrl
          });
        } else {
          processedFiles.push(file);
        }
      } catch (err) {
        console.error("❌ 파일 스토리지 변환 실패:", file.name, err);
        processedFiles.push(file);
      }
    } else {
      processedFiles.push(file);
    }
  }

  return processedFiles;
}

/**
 * 기존 데이터베이스에 보관 중이던 구식 이미지 데이터를 각각의 스토리지 버킷으로 자동 이관합니다.
 * - 개인 프로필 사진(base64) -> 'profiles' 버킷
 * - 만남 기록 첨부파일(base64) -> 'documents' 버킷
 */
export async function migrateExistingFilesToStorage(): Promise<void> {
  // 이미 실행되었음을 보장하기 위해 sessionStorage 플래그 사용 (중복 가동 차단)
  if (typeof window !== "undefined") {
    if (sessionStorage.getItem("mindmap_files_migrated") === "true") return;
  }

  console.log("🚀 [Migration] 구식 이미지 및 파일 분리 이관(profiles/documents) 검사 시작...");

  try {
    // 1. 개인 프로필 노드 (mindmap_nodes) 마이그레이션 -> 'profiles' 버킷으로 저장
    const { data: nodes, error: nodesError } = await supabase
      .from("mindmap_nodes")
      .select("id, name, photo");

    if (nodesError) throw nodesError;

    if (nodes && nodes.length > 0) {
      for (const node of nodes) {
        if (!node.photo) continue;

        const isBase64 = node.photo.startsWith("data:");

        // base64로만 이루어진 구식 프로필 사진만 'profiles' 버킷으로 업로드 이관 수행
        if (isBase64) {
          console.log(`📦 [Migration] 노드 '${node.name}'의 프로필 사진을 'profiles' 버킷으로 이관 중...`);
          try {
            const blob = dataURLtoBlob(node.photo);
            const publicUrl = await uploadToSupabaseStorage("profiles", `node_profile_${node.id}`, blob);
            
            if (publicUrl) {
              const { error: updateError } = await supabase
                .from("mindmap_nodes")
                .update({ photo: publicUrl })
                .eq("id", node.id);

              if (updateError) throw updateError;
              console.log(`✅ [Migration] 노드 '${node.name}' 프로필 사진 이관 완료 -> ${publicUrl}`);
            }
          } catch (err) {
            console.error(`❌ [Migration] 노드 '${node.name}' 프로필 사진 이관 실패:`, err);
          }
        }
      }
    }

    // 2. 만남 활동 기록 (mindmap_activities) 마이그레이션 -> 'documents' 버킷으로 저장
    const { data: activities, error: actError } = await supabase
      .from("mindmap_activities")
      .select("id, user_id, node_id, activity_name, files");

    if (actError) throw actError;

    if (activities && activities.length > 0) {
      for (const act of activities) {
        if (!act.files || act.files.length === 0) continue;

        const hasBase64 = (act.files as ActivityFile[]).some((f: ActivityFile) => f.url && f.url.startsWith("data:"));

        if (hasBase64) {
          console.log(`📦 [Migration] 만남 기록 '${act.activity_name || act.id}'의 첨부파일을 'documents' 버킷으로 이관 중...`);
          try {
            const migratedFiles = await uploadFilesToStorageIfNeeded(act.files);
            
            const { error: updateActError } = await supabase
              .from("mindmap_activities")
              .update({ files: migratedFiles })
              .eq("id", act.id);

            if (updateActError) throw updateActError;
            console.log(`✅ [Migration] 만남 기록 '${act.activity_name || act.id}' 첨부파일 이관 완료!`);
            
            // 로컬 스토리지 동기화 강제 갱신
            if (typeof window !== "undefined" && act.user_id) {
              const key = `mindmap_activities_${act.user_id}_${act.node_id}`;
              const localData = localStorage.getItem(key);
              if (localData) {
                const localActs: ActivityData[] = JSON.parse(localData);
                const updatedLocal = localActs.map(a => a.id === act.id ? { ...a, files: migratedFiles } : a);
                saveActivitiesToLocal(act.user_id, act.node_id, updatedLocal);
              }
            }
          } catch (err) {
            console.error(`❌ [Migration] 만남 기록 '${act.activity_name || act.id}' 이관 실패:`, err);
          }
        }
      }
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("mindmap_files_migrated", "true");
    }
    console.log("🏁 [Migration] 모든 이미지 및 파일 분리 이관 완료!");

  } catch (err) {
    console.error("❌ [Migration] 데이터 통합 이관 작업 중 치명적 오류:", err);
  }
}
