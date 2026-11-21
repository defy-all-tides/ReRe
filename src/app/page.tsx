"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect } from "react";
import AddRelationshipSidebar from "@/components/AddRelationshipSidebar";
import AuthModal from "@/components/AuthModal";
import MeetingLogModal from "@/components/MeetingLogModal";
import MeetingListModal from "@/components/MeetingListModal";
import { authService, User } from "@/lib/authService";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllActivities, calculateIntimacyScore, migrateExistingFilesToStorage } from "@/lib/activityService";

const Mindmap = dynamic(() => import("@/components/Mindmap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin"></div>
    </div>
  ),
});

export interface GroupData {
  id: string;
  name: string;
  color: string;
}

export interface NodeData {
  id: string;
  name: string;
  relation: string;
  age?: string;
  job?: string;
  photo?: string;
  groupId: string | null;
  groupIds?: string[];
  x: number;
  y: number;
  memoAppointment?: string;
  memoPersonal?: string;
  memoHistory?: string;
  memoPrecautions?: string;
}

export interface ConnectionData {
  from: string;
  to: string;
}

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [connections, setConnections] = useState<ConnectionData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 인증 및 로그인 상태
  const [currentUser, setCurrentUser] = useState<Omit<User, "password"> | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [isMeetingListModalOpen, setIsMeetingListModalOpen] = useState(false);

  // 세션 확인
  useEffect(() => {
    const checkSession = async () => {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
      } else {
        setIsAuthModalOpen(true);
      }
    };
    checkSession();
  }, []);

  // Supabase 실시간 데이터 로드 및 자동 마이그레이션 엔진
  useEffect(() => {
    if (!currentUser) return;
    
    const loadAndMigrateData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const userId = user.id;
        const emailKey = currentUser.email;

        // 1. Supabase 클라우드 데이터 우선 조회
        const { data: dbNodes, error: nodesErr } = await supabase
          .from("mindmap_nodes")
          .select("*")
          .eq("user_id", userId);
        
        const { data: dbGroups, error: groupsErr } = await supabase
          .from("mindmap_groups")
          .select("*")
          .eq("user_id", userId);
          
        const { data: dbConns, error: connsErr } = await supabase
          .from("mindmap_connections")
          .select("*")
          .eq("user_id", userId);

        if (nodesErr || groupsErr || connsErr) {
          console.error("❌ Supabase 데이터 조회 오류:", { nodesErr, groupsErr, connsErr });
        }

        // 2. 만약 Supabase DB 상에 노드가 0개이고, 로컬 스토리지에 기존 데이터가 있는 경우 마이그레이션 작동
        const savedNodes = localStorage.getItem(`mindmap_nodes_${emailKey}`);
        const savedConnections = localStorage.getItem(`mindmap_connections_${emailKey}`);
        const savedGroups = localStorage.getItem(`mindmap_groups_${emailKey}`);
        
        const hasLocalData = savedNodes && JSON.parse(savedNodes).length > 0;
        const hasCloudData = dbNodes && dbNodes.length > 0;

        if (!hasCloudData && hasLocalData) {
          console.log("🚀 기존 로컬 마인드맵 발견! Supabase 클라우드 마이그레이션 시작...");
          
          const localGroups: GroupData[] = savedGroups ? JSON.parse(savedGroups) : [];
          const localNodes: NodeData[] = savedNodes ? JSON.parse(savedNodes) : [];
          const localConns: ConnectionData[] = savedConnections ? JSON.parse(savedConnections) : [];

          // A. 그룹 일괄 마이그레이션
          if (localGroups.length > 0) {
            await supabase.from("mindmap_groups").insert(
              localGroups.map((g) => ({
                id: g.id,
                user_id: userId,
                name: g.name,
                color: g.color,
              }))
            );
          }

          // B. 노드 일괄 마이그레이션
          if (localNodes.length > 0) {
            await supabase.from("mindmap_nodes").insert(
              localNodes.map((n) => ({
                id: n.id,
                user_id: userId,
                name: n.name,
                relation: n.relation,
                age: n.age || null,
                job: n.job || null,
                photo: n.photo || null,
                x: n.x,
                y: n.y,
                memo_appointment: n.memoAppointment || null,
                memo_personal: n.memoPersonal || null,
                memo_history: n.memoHistory || null,
                memo_precautions: n.memoPrecautions || null,
                group_ids: n.groupIds || [],
              }))
            );
          }

          // C. 관계선 일괄 마이그레이션
          if (localConns.length > 0) {
            await supabase.from("mindmap_connections").insert(
              localConns.map((c) => ({
                from_node: c.from,
                to_node: c.to,
                user_id: userId,
              }))
            );
          }

          console.log("✅ Supabase 클라우드 마이그레이션 완료!");
          
          // 마이그레이션 완료 후 데이터 적용
          setGroups(localGroups);
          setNodes(localNodes);
          setConnections(localConns);

          // 더 이상 필요 없는 기존 로컬 스토리지 원본은 정리 가능하지만 백업으로 보존하고 완료 마커 설정
          localStorage.setItem(`mindmap_migrated_${emailKey}`, "true");
        } else {
          // 3. 마이그레이션이 불필요한 경우, 클라우드 DB의 실시간 데이터를 화면에 로드
          const formattedGroups: GroupData[] = (dbGroups || []).map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
          }));

          const formattedNodes: NodeData[] = (dbNodes || []).map((n) => ({
            id: n.id,
            name: n.name,
            relation: n.relation,
            age: n.age || undefined,
            job: n.job || undefined,
            photo: n.photo || undefined,
            groupId: null, // deprecated
            groupIds: n.group_ids || [],
            x: Number(n.x),
            y: Number(n.y),
            memoAppointment: n.memo_appointment || undefined,
            memoPersonal: n.memo_personal || undefined,
            memoHistory: n.memo_history || undefined,
            memoPrecautions: n.memo_precautions || undefined,
          }));

          const formattedConns: ConnectionData[] = (dbConns || []).map((c) => ({
            from: c.from_node,
            to: c.to_node,
          }));

          setGroups(formattedGroups);
          setNodes(formattedNodes);
          setConnections(formattedConns);
        }

        // 히든 그룹 필터 로드 (필터는 로컬에 유지해도 무방)
        const savedHiddenGroups = localStorage.getItem(`mindmap_hidden_groups_${emailKey}`);
        if (savedHiddenGroups) {
          setHiddenGroupIds(JSON.parse(savedHiddenGroups));
        } else {
          setHiddenGroupIds([]);
        }

        setIsHydrated(true);

        // [NEW] 기존 base64/구식 profiles 이미지를 documents 스토리지로 통합 이관하는 백그라운드 엔진 구동
        migrateExistingFilesToStorage().then(() => {
          // 이관 완료 시 새로 갱신된 Public URL 노드 목록을 화면 상태에 실시간 리프레시 반영
          supabase.from("mindmap_nodes")
            .select("*")
            .eq("user_id", userId)
            .then(({ data: freshNodes }) => {
              if (freshNodes && freshNodes.length > 0) {
                setNodes(prev => prev.map(node => {
                  const fresh = freshNodes.find(fn => fn.id === node.id);
                  return fresh ? { ...node, photo: fresh.photo || undefined } : node;
                }));
              }
            });
        });
      } catch (err) {
        console.error("❌ 마인드맵 데이터 초기 연동 실패:", err);
      }
    };

    loadAndMigrateData();
  }, [currentUser]);

  // 필터 변경 시에만 가벼운 로컬스토리지 백업
  useEffect(() => {
    if (isHydrated && currentUser) {
      localStorage.setItem(`mindmap_hidden_groups_${currentUser.email}`, JSON.stringify(hiddenGroupIds));
    }
  }, [hiddenGroupIds, isHydrated, currentUser]);

  const handleSaveNode = async (data: { 
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
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const userId = user.id;

      let finalGroupIds = [...data.groupIds];

      if (data.newGroupName) {
        const newGroupId = Math.random().toString(36).substring(2, 11);
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
        const randomColor = colors[groups.length % colors.length];
        
        const newGroup: GroupData = {
          id: newGroupId,
          name: data.newGroupName,
          color: randomColor
        };

        // Supabase DB에 신규 그룹 추가
        await supabase.from("mindmap_groups").insert({
          id: newGroupId,
          user_id: userId,
          name: data.newGroupName,
          color: randomColor
        });

        setGroups(prev => [...prev, newGroup]);
        if (finalGroupIds.length < 3) {
          finalGroupIds.push(newGroupId);
        }
      }

      if (data.id) {
        // 기존 노드 Supabase 업데이트
        await supabase.from("mindmap_nodes").update({
          name: data.name,
          relation: data.relation,
          age: data.age || null,
          job: data.job || null,
          photo: data.photo || null,
          group_ids: finalGroupIds,
          memo_appointment: data.memoAppointment || null,
          memo_personal: data.memoPersonal || null,
          memo_history: data.memoHistory || null,
          memo_precautions: data.memoPrecautions || null
        }).eq("id", data.id);

        // 기존 노드 로컬 상태 수정
        setNodes((prev) => 
          prev.map(node => 
             node.id === data.id ? { 
              ...node, 
              name: data.name, 
              relation: data.relation, 
              age: data.age, 
              job: data.job, 
              photo: data.photo, 
              groupIds: finalGroupIds,
              memoAppointment: data.memoAppointment,
              memoPersonal: data.memoPersonal,
              memoHistory: data.memoHistory,
              memoPrecautions: data.memoPrecautions
            } : node
          )
        );
      } else {
        // 새 노드 추가 시 위치 결정
        const currentNodes = nodes;
        const groupMembers = currentNodes.filter(n => {
          const nIds = n.groupIds || (n.groupId ? [n.groupId] : []);
          return nIds.some(id => finalGroupIds.includes(id));
        });

        let startX, startY;
        const MIN_DISTANCE = 60; // 노드 간 최소 거리 (축소됨)

        const findSafePosition = (targetX: number, targetY: number) => {
          let tx = targetX;
          let ty = targetY;
          let attempts = 0;
          
          while (attempts < 30) {
            const isOverlapping = currentNodes.some(n => {
              const dist = Math.sqrt(Math.pow(n.x - tx, 2) + Math.pow(n.y - ty, 2));
              return dist < MIN_DISTANCE;
            });
            
            if (!isOverlapping) return { x: tx, y: ty };
            
            // 겹치면 새로운 시도 (나선형 또는 랜덤 방향으로 확장)
            const angle = Math.random() * Math.PI * 2;
            const pushDist = MIN_DISTANCE + (attempts * 10);
            tx = targetX + Math.cos(angle) * pushDist;
            ty = targetY + Math.sin(angle) * pushDist;
            attempts++;
          }
          return { x: tx, y: ty };
        };

        if (groupMembers.length > 0) {
          // 그룹 멤버들의 평균 위치 계산
          const avgX = groupMembers.reduce((sum, n) => sum + n.x, 0) / groupMembers.length;
          const avgY = groupMembers.reduce((sum, n) => sum + n.y, 0) / groupMembers.length;
          const safePos = findSafePosition(avgX, avgY);
          startX = safePos.x;
          startY = safePos.y;
        } else {
          // 멤버가 없으면 중앙 근처에서 안전한 위치 찾기
          const safePos = findSafePosition(150, -100);
          startX = safePos.x;
          startY = safePos.y;
        }

        const newId = Math.random().toString(36).substring(2, 11);

        // Supabase DB에 새 노드 추가
        await supabase.from("mindmap_nodes").insert({
          id: newId,
          user_id: userId,
          name: data.name,
          relation: data.relation,
          age: data.age || null,
          job: data.job || null,
          photo: data.photo || null,
          x: startX,
          y: startY,
          memo_appointment: data.memoAppointment || null,
          memo_personal: data.memoPersonal || null,
          memo_history: data.memoHistory || null,
          memo_precautions: data.memoPrecautions || null,
          group_ids: finalGroupIds
        });

        const newNode: NodeData = {
          id: newId,
          name: data.name,
          relation: data.relation,
          age: data.age,
          job: data.job,
          photo: data.photo,
          groupId: null, // deprecated
          groupIds: finalGroupIds,
          x: startX,
          y: startY,
          memoAppointment: data.memoAppointment,
          memoPersonal: data.memoPersonal,
          memoHistory: data.memoHistory,
          memoPrecautions: data.memoPrecautions
        };

        setNodes((prev) => [...prev, newNode]);
      }
      setIsSidebarOpen(false);
    } catch (err) {
      console.error("❌ 노드 저장 중 에러 발생:", err);
    }
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedNodeId(null);
  };

  const handleDisconnectNode = async (id: string) => {
    try {
      // Supabase DB 연결선 삭제
      await supabase.from("mindmap_connections")
        .delete()
        .or(`and(from_node.eq.me,to_node.eq.${id}),and(from_node.eq.${id},to_node.eq.me)`);

      console.log("Disconnecting node from Supabase:", id);
      setConnections(prev => prev.filter(c => !(c.from === "me" && c.to === id) && !(c.from === id && c.to === "me")));
      setIsSidebarOpen(false);
      setSelectedNodeId(null);
    } catch (err) {
      console.error("❌ 연결 끊기 에러:", err);
    }
  };

  const handleDeleteNode = async (id: string) => {
    try {
      // Supabase DB 노드 삭제 (Cascade 룰로 인해 연결선도 함께 삭제됨)
      await supabase.from("mindmap_nodes").delete().eq("id", id);

      console.log("Deleting node from Supabase:", id);
      setNodes(prev => prev.filter(n => n.id !== id));
      setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
      setIsSidebarOpen(false);
      setSelectedNodeId(null);
    } catch (err) {
      console.error("❌ 노드 삭제 에러:", err);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const userId = user.id;

      // 1. Supabase DB 그룹 삭제
      await supabase.from("mindmap_groups").delete().eq("id", groupId);

      // 2. 해당 그룹을 소유하던 노드들의 group_ids 갱신
      const affectedNodes = nodes.filter(node => (node.groupIds || []).includes(groupId));
      const updates = affectedNodes.map(node => {
        const updatedIds = (node.groupIds || []).filter(id => id !== groupId);
        return supabase.from("mindmap_nodes").update({ group_ids: updatedIds }).eq("id", node.id);
      });
      await Promise.all(updates);

      setGroups(prev => prev.filter(g => g.id !== groupId));
      setNodes(prev => prev.map(node => {
        const currentGroupIds = node.groupIds || (node.groupId ? [node.groupId] : []);
        return {
          ...node,
          groupId: node.groupId === groupId ? null : node.groupId,
          groupIds: currentGroupIds.filter(id => id !== groupId)
        };
      }));
    } catch (err) {
      console.error("❌ 그룹 삭제 에러:", err);
    }
  };

  const filteredNodes = nodes.filter(n => {
    const nodeGroupIds = n.groupIds || (n.groupId ? [n.groupId] : []);
    if (nodeGroupIds.length === 0) return true; // 그룹이 없는 노드는 항상 표시
    return nodeGroupIds.some(id => !hiddenGroupIds.includes(id));
  });
  
  const toggleGroup = (groupId: string) => {
    setHiddenGroupIds(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId) 
        : [...prev, groupId]
    );
  };

  const handleDeleteConnection = async (from: string, to: string) => {
    try {
      await supabase.from("mindmap_connections")
        .delete()
        .or(`and(from_node.eq.${from},to_node.eq.${to}),and(from_node.eq.${to},to_node.eq.${from})`);

      setConnections(prev => prev.filter(c => !(c.from === from && c.to === to) && !(c.from === to && c.to === from)));
    } catch (err) {
      console.error("❌ 관계선 삭제 에러:", err);
    }
  };

  const handleAddConnection = async (from: string, to: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const userId = user.id;

      await supabase.from("mindmap_connections").insert({
        from_node: from,
        to_node: to,
        user_id: userId
      });

      setConnections(prev => [...prev, { from, to }]);
    } catch (err) {
      console.error("❌ 관계선 생성 에러:", err);
    }
  };

  const handleNodeDragEnd = async (id: string, x: number, y: number) => {
    try {
      await supabase.from("mindmap_nodes").update({ x, y }).eq("id", id);
      setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
    } catch (err) {
      console.error("❌ 노드 드래그 좌표 저장 에러:", err);
    }
  };

  const handleApplyLayout = async () => {
    if (!currentUser) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const userId = user.id;

      // 1. 모든 소통 데이터 가져오기
      const allActivities = await fetchAllActivities(userId);

      // 노드별 활동 기록 그룹핑
      const activitiesByNode: Record<string, any[]> = {};
      allActivities.forEach(act => {
        activitiesByNode[act.node_id] = activitiesByNode[act.node_id] || [];
        activitiesByNode[act.node_id].push(act);
      });

      const RADIUS = 210;
      const GROUP_INNER_RADIUS = 65; // 그룹 내 군집들이 퍼질 반경
      
      setNodes(prevNodes => {
        const updatedNodes = prevNodes.map(n => ({ ...n }));
        
        // 1. 그룹 통계 및 정렬 (색상 회피 우선순위 상향)
        const groupStats = groups.map(g => {
          const members = nodes.filter(n => (n.groupIds || (n.groupId ? [n.groupId] : [])).includes(g.id));
          return { id: g.id, color: g.color, members: new Set(members.map(m => m.id)) };
        });

        const similarity: Record<string, Record<string, number>> = {};
        groupStats.forEach(g1 => {
          similarity[g1.id] = {};
          groupStats.forEach(g2 => {
            if (g1.id === g2.id) return;
            similarity[g1.id][g2.id] = [...g1.members].filter(id => g2.members.has(id)).length;
          });
        });

        // 2. 현재 배치를 기반으로 초기 순서 추론 (안정성 확보)
        const groupIds = groups.map(g => g.id);
        const currentGroupAngles = groupIds.map(id => {
          const members = updatedNodes.filter(n => (n.groupIds || (n.groupId ? [n.groupId] : [])).includes(id));
          if (members.length === 0) return { id, angle: Math.random() * Math.PI * 2 };
          const avgX = members.reduce((sum, n) => sum + n.x, 0) / members.length;
          const avgY = members.reduce((sum, n) => sum + n.y, 0) / members.length;
          return { id, angle: Math.atan2(avgY, avgX) };
        }).sort((a, b) => a.angle - b.angle);
        
        let stableOrder = currentGroupAngles.map(a => a.id);

        // 3. 최소 스왑(Swap)으로 색상 충돌만 해결
        if (stableOrder.length > 1) {
          for (let iter = 0; iter < 10; iter++) { // 최대 10회 스왑 시도
            let conflictFound = false;
            for (let i = 0; i < stableOrder.length; i++) {
              const nextIdx = (i + 1) % stableOrder.length;
              const c1 = groupStats.find(s => s.id === stableOrder[i])?.color;
              const c2 = groupStats.find(s => s.id === stableOrder[nextIdx])?.color;
              
              if (c1 === c2) {
                conflictFound = true;
                // 충돌 해결을 위한 최적의 교체 대상 찾기
                let bestSwapIdx = -1;
                for (let j = 0; j < stableOrder.length; j++) {
                  if (j === i || j === nextIdx) continue;
                  // j와 nextIdx를 바꿨을 때 i-j, j-next+1, prev-next, next-next+1의 충돌 여부 확인
                  const cJ = groupStats.find(s => s.id === stableOrder[j])?.color;
                  const prevJIdx = (j - 1 + stableOrder.length) % stableOrder.length;
                  const nextJIdx = (j + 1) % stableOrder.length;
                  const cPrevJ = groupStats.find(s => s.id === stableOrder[prevJIdx])?.color;
                  const cNextJ = groupStats.find(s => s.id === stableOrder[nextJIdx])?.color;
                  
                  if (cJ !== c1 && cJ !== cNextJ && c2 !== cPrevJ) {
                    bestSwapIdx = j;
                    break;
                  }
                }
                
                if (bestSwapIdx !== -1) {
                  const temp = stableOrder[nextIdx];
                  stableOrder[nextIdx] = stableOrder[bestSwapIdx];
                  stableOrder[bestSwapIdx] = temp;
                }
              }
            }
            if (!conflictFound) break;
          }
        }
        const orderedGroupIds = stableOrder;

        // 2. 그룹별 중심점 설정
        const groupCenters: Record<string, { x: number, y: number, angle: number }> = {};
        orderedGroupIds.forEach((id, index) => {
          const angle = (index / orderedGroupIds.length) * Math.PI * 2;
          groupCenters[id] = { x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS, angle };
        });

        // 3. 그룹 내 군집(Component) 분석 및 초기 배치
        const nodeToComponent = new Map<string, number>();
        const groupComponents = new Map<string, string[][]>();

        orderedGroupIds.forEach(gid => {
          const members = updatedNodes.filter(n => (n.groupIds || (n.groupId ? [n.groupId] : [])).includes(gid));
          const visited = new Set<string>();
          const components: string[][] = [];
          
          members.forEach(m => {
            if (visited.has(m.id)) return;
            const comp: string[] = [];
            const q = [m.id];
            visited.add(m.id);
            while (q.length > 0) {
              const cid = q.shift()!;
              comp.push(cid);
              connections.forEach(conn => {
                const other = conn.from === cid ? conn.to : (conn.to === cid ? conn.from : null);
                if (other && !visited.has(other) && members.find(gm => gm.id === other)) {
                  visited.add(other); q.push(other);
                }
              });
            }
            components.push(comp);
          });
          groupComponents.set(gid, components);
          
          // 초기 배치 (군집별로 나누어 배치 시 친밀도 반경 반영)
          const center = groupCenters[gid];
          components.forEach((comp, cIdx) => {
            const cAngle = center.angle + (cIdx / components.length - 0.5) * 0.5;
            
            comp.forEach((nid, nIdx) => {
              const node = updatedNodes.find(n => n.id === nid)!;
              
              // 친밀도 기반 개별 타겟 반경 계산
              const acts = activitiesByNode[node.id] || [];
              const score = calculateIntimacyScore(acts);
              const targetRadius = 120 + 180 / (1 + 0.5 * score);
              
              const cx = Math.cos(cAngle) * (targetRadius + (components.length > 1 ? 20 : 0));
              const cy = Math.sin(cAngle) * (targetRadius + (components.length > 1 ? 20 : 0));
              
              const nAngle = (nIdx / comp.length) * Math.PI * 2;
              node.x = cx + Math.cos(nAngle) * 15;
              node.y = cy + Math.sin(nAngle) * 15;
            });
          });
        });

        // 4. 강력한 컴포넌트 보호 시뮬레이션 (50회)
        for (let i = 0; i < 50; i++) {
          let changed = false;
          
          // A. 척력 (동일 군집 내 vs 타 군집 간 차별화)
          for (let j = 0; j < updatedNodes.length; j++) {
            for (let k = j + 1; k < updatedNodes.length; k++) {
              const n1 = updatedNodes[j], n2 = updatedNodes[k];
              const dx = n2.x - n1.x, dy = n2.y - n1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              // 같은 그룹/군집인지 확인
              const isSameComp = connections.some(c => (c.from === n1.id && c.to === n2.id) || (c.from === n2.id && c.to === n1.id));
              const minDist = isSameComp ? 70 : 100; // 타 군집은 더 멀리 밀어냄
              
              if (dist < minDist) {
                const force = (minDist - dist) * 0.4;
                const angle = dist > 0.1 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
                n1.x -= Math.cos(angle) * force; n1.y -= Math.sin(angle) * force;
                n2.x += Math.cos(angle) * force; n2.y += Math.sin(angle) * force;
                changed = true;
              }
            }
          }

          // B. 군집 내 인력 (n각형 유지)
          connections.forEach(conn => {
            const n1 = updatedNodes.find(n => n.id === conn.from) || (conn.from === "me" ? { x: 0, y: 0 } : null);
            const n2 = updatedNodes.find(n => n.id === conn.to) || (conn.to === "me" ? { x: 0, y: 0 } : null);
            if (n1 && n2 && n1 !== n2) {
              const dx = n2.x - n1.x, dy = n2.y - n1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const targetDist = 75;
              if (dist > targetDist) {
                const force = (dist - targetDist) * 0.15;
                const angle = Math.atan2(dy, dx);
                if (conn.from !== "me") { n1.x += Math.cos(angle) * force; n1.y += Math.sin(angle) * force; }
                if (conn.to !== "me") { n2.x -= Math.cos(angle) * force; n2.y -= Math.sin(angle) * force; }
                changed = true;
              }
            }
          });

          // C. 그룹 및 중앙 보호 (친밀도 반경 매핑 적용)
          updatedNodes.forEach(node => {
            const nodeGroupIds = (node.groupIds || (node.groupId ? [node.groupId] : [])).filter(id => groupCenters[id]);
            
            // 친밀도 반경 동적 적용
            const acts = activitiesByNode[node.id] || [];
            const score = calculateIntimacyScore(acts);
            const targetRadius = 120 + 180 / (1 + 0.5 * score);

            if (nodeGroupIds.length > 0) {
              const center = groupCenters[nodeGroupIds[0]];
              // 그룹 각도를 유지하며 노드별 타겟 배치 반경 적용
              const targetX = Math.cos(center.angle) * targetRadius;
              const targetY = Math.sin(center.angle) * targetRadius;
              
              node.x += (targetX - node.x) * 0.08;
              node.y += (targetY - node.y) * 0.08;
            } else {
              // 그룹이 없을 경우 현재 각도를 유지하며 친밀도 반경으로 수렴
              const currentAngle = Math.atan2(node.y, node.x) || (Math.random() * Math.PI * 2);
              const targetX = Math.cos(currentAngle) * targetRadius;
              const targetY = Math.sin(currentAngle) * targetRadius;
              
              node.x += (targetX - node.x) * 0.08;
              node.y += (targetY - node.y) * 0.08;
            }
            
            // 중앙(Me) 보호
            const dToMe = Math.sqrt(node.x**2 + node.y**2);
            if (dToMe < 110) {
              const f = (110 - dToMe) * 0.2;
              const a = Math.atan2(node.y, node.x);
              node.x += Math.cos(a) * f; node.y += Math.sin(a) * f;
              changed = true;
            }
          });

          // D. 화면 경계 제한
          updatedNodes.forEach(node => {
            const marginX = 400, minY = -250, maxY = 200;
            node.x = Math.max(-marginX, Math.min(marginX, node.x));
            node.y = Math.max(minY, Math.min(maxY, node.y));
          });

          if (!changed) break;
        }

        // 5. Supabase에 변경된 좌표 일괄 영구 저장
        Promise.all(
          updatedNodes.map(node =>
            supabase.from("mindmap_nodes").update({ x: node.x, y: node.y }).eq("id", node.id)
          )
        ).then(() => {
          console.log("✅ 정렬된 노드 좌표 Supabase 일괄 저장 완료!");
        }).catch(err => {
          console.error("❌ 노드 좌표 정렬 저장 에러:", err);
        });

        return updatedNodes;
      });
    } catch (err) {
      console.error("❌ 자동 정렬 중 활동 데이터 연동 실패:", err);
    }
  };

  if (!mounted) {
    return (
      <div 
        className="relative min-h-screen overflow-hidden bg-white dark:bg-slate-950 flex items-center justify-center"
        suppressHydrationWarning
      >
        <div className="w-12 h-12 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" suppressHydrationWarning />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-slate-950 font-inter font-light" suppressHydrationWarning>
      {/* Background Decorative Elements */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between font-outfit">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Relationship Reminder</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            {currentUser ? (
              <>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="font-semibold text-xs">{currentUser.name} 님</span>
                </div>
                <button
                  onClick={async () => {
                    await authService.logout();
                    setCurrentUser(null);
                    setNodes([]);
                    setConnections([]);
                    setGroups([]);
                    setIsHydrated(false);
                    setIsAuthModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-red-500 hover:border-red-200 dark:hover:border-red-950 rounded-xl transition-all cursor-pointer"
                >
                  로그아웃
                </button>
                <button
                  onClick={() => setIsMeetingListModalOpen(true)}
                  className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold hover:scale-105 transition-transform active:scale-95 cursor-pointer border border-emerald-250/40 dark:border-emerald-900/40"
                >
                  만남 목록
                </button>
                <button 
                  onClick={() => setIsMeetingModalOpen(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold hover:scale-105 transition-transform active:scale-95 shadow-md shadow-emerald-500/10 cursor-pointer"
                >
                  만남 추가
                </button>
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:scale-105 transition-transform active:scale-95 shadow-md shadow-blue-500/10 cursor-pointer"
                >
                  관계 추가
                </button>
              </>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="px-5 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:scale-105 transition-transform active:scale-95 shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                로그인
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative flex-1 flex items-center justify-center pt-20">
        <div className="w-full h-full max-w-full">
          <Mindmap 
            nodes={filteredNodes}
            setNodes={setNodes}
            connections={connections}
            setConnections={setConnections}
            onDeleteConnection={handleDeleteConnection}
            onAddConnection={handleAddConnection}
            onNodeDragEnd={handleNodeDragEnd}
            groups={groups}
            onAddRelationship={() => setIsSidebarOpen(true)}
            onNodeClick={(id) => {
              setSelectedNodeId(id);
              setIsSidebarOpen(true);
            }}
          />
        </div>
      </main>

      {/* Group Toggles Footer */}
      <footer className="fixed bottom-0 w-full z-40 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm border-t border-slate-100 dark:border-slate-900 px-8 py-4 flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        <div className="flex flex-wrap items-center gap-2 max-w-4xl">
          {groups.map(group => {
            const isActive = !hiddenGroupIds.includes(group.id);
            return (
              <button
                key={group.id}
                onClick={() => toggleGroup(group.id)}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm flex items-center gap-2 border`}
                style={{
                  backgroundColor: isActive ? `${group.color}15` : 'transparent',
                  borderColor: isActive ? group.color : '#cbd5e1',
                  color: isActive ? group.color : '#94a3b8',
                }}
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full transition-colors" 
                  style={{ backgroundColor: isActive ? group.color : '#cbd5e1' }}
                />
                {group.name}
              </button>
            );
          })}
          
          {groups.length > 0 && (
            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setHiddenGroupIds([])}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-brand-primary transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                전체 선택
              </button>
              <button
                onClick={() => setHiddenGroupIds(groups.map(g => g.id))}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-red-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                전체 해제
              </button>
            </div>
          )}
        </div>
        
        <button
          onClick={handleApplyLayout}
          className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-xl text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          관계도 자동 정렬
        </button>
      </footer>

      {/* Sidebar */}
      <AddRelationshipSidebar 
        isOpen={isSidebarOpen} 
        onClose={handleCloseSidebar} 
        onSave={handleSaveNode}
        onDisconnect={handleDisconnectNode}
        onDelete={handleDeleteNode}
        onDeleteGroup={handleDeleteGroup}
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        groups={groups}
      />

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsAuthModalOpen(false);
        }}
      />

      {/* Meeting Log Modal */}
      {currentUser && (
        <MeetingLogModal
          isOpen={isMeetingModalOpen}
          onClose={() => setIsMeetingModalOpen(false)}
          nodes={nodes}
          groups={groups}
          onSaveSuccess={async () => {
            await handleApplyLayout();
          }}
          onEditProfile={(nodeId) => {
            setSelectedNodeId(nodeId);
            setIsSidebarOpen(true);
          }}
        />
      )}

      {/* Meeting List & Edit Modal */}
      {currentUser && (
        <MeetingListModal
          isOpen={isMeetingListModalOpen}
          onClose={() => setIsMeetingListModalOpen(false)}
          nodes={nodes}
          groups={groups}
          onSaveSuccess={async () => {
            await handleApplyLayout();
          }}
        />
      )}
    </div>
  );
}
