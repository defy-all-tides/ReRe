"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { User, Plus, Camera } from "lucide-react";
import { NodeData, ConnectionData, GroupData } from "@/app/page";

interface MindmapProps {
  nodes?: NodeData[];
  setNodes?: React.Dispatch<React.SetStateAction<NodeData[]>>;
  connections?: ConnectionData[];
  setConnections?: React.Dispatch<React.SetStateAction<ConnectionData[]>>;
  groups?: GroupData[];
  onAddRelationship?: () => void;
  onNodeClick?: (id: string) => void;
  onDeleteConnection?: (from: string, to: string) => void;
  onAddConnection?: (from: string, to: string) => void;
  onNodeDragEnd?: (id: string, x: number, y: number) => void;
}

export default function Mindmap({ 
  nodes = [], 
  setNodes, 
  connections = [], 
  setConnections, 
  groups = [],
  onAddRelationship,
  onNodeClick,
  onDeleteConnection,
  onAddConnection,
  onNodeDragEnd
}: MindmapProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [drawingActive, setDrawingActive] = useState(false);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const drawX = useMotionValue(0);
  const drawY = useMotionValue(0);
  const [drawingFromId, setDrawingFromId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<any>(null);
  const dragOccurred = useRef(false);
  const drawingOccurred = useRef(false);
  const lineLongPressTimer = useRef<any>(null);
  const [activeLine, setActiveLine] = useState<{from: string, to: string} | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{from: string, to: string, fromName: string, toName: string} | null>(null);

  const cancelLineLongPress = () => {
    if (lineLongPressTimer.current) {
      clearTimeout(lineLongPressTimer.current);
      lineLongPressTimer.current = null;
    }
    setActiveLine(null);
  };

  const handleLinePointerDown = (from: string, to: string) => {
    cancelLineLongPress();
    setActiveLine({ from, to });
    lineLongPressTimer.current = setTimeout(() => {
      const fromNode = from === "me" ? { name: "나" } : nodes.find(n => n.id === from);
      const toNode = to === "me" ? { name: "나" } : nodes.find(n => n.id === to);
      
      setDeleteConfirm({
        from,
        to,
        fromName: fromNode?.name || "알 수 없음",
        toName: toNode?.name || "알 수 없음"
      });
      
      setActiveLine(null);
      lineLongPressTimer.current = null;
    }, 600); // 롱프레스 시간 단축
  };

  useEffect(() => {
    setIsLoaded(true);
    const timer = setTimeout(() => setNodesLoaded(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const getRelativeCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return { x: clientX - centerX, y: clientY - centerY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawingActive) {
      const coords = getRelativeCoords(e.clientX, e.clientY);
      drawX.set(coords.x);
      drawY.set(coords.y);
    }
  };

  const startDrawing = (id: string, startX: number, startY: number) => {
    setDrawingFromId(id);
    setDrawingActive(true);
    drawingOccurred.current = true;
    drawX.set(startX);
    drawY.set(startY);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleNodePointerDown = (id: string, x: number, y: number) => {
    cancelLongPress();
    dragOccurred.current = false;
    drawingOccurred.current = false;
    longPressTimer.current = setTimeout(() => {
      startDrawing(id, x, y);
    }, 500); // 0.5초 롱프레스
  };

  const handleGlobalPointerUp = (e: PointerEvent) => {
    cancelLongPress();
    if (drawingActive) {
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const targetNodeEl = elements.find(el => el.closest('[data-node-id]') && el.closest('[data-node-id]')?.getAttribute('data-node-id') !== drawingFromId)?.closest('[data-node-id]');
      
      if (targetNodeEl) {
        const targetId = targetNodeEl.getAttribute('data-node-id') || "";
        const fromId = drawingFromId || "";
        
        if (targetId && fromId && targetId !== fromId) {
          const alreadyConnected = connections.some(c => (c.from === fromId && c.to === targetId) || (c.from === targetId && c.to === fromId));
          if (!alreadyConnected) {
            if (onAddConnection) {
              onAddConnection(fromId, targetId);
            } else if (setConnections) {
              setConnections(prev => [...prev, { from: fromId, to: targetId }]);
            }
          }
        }
      }
      setDrawingActive(false);
      setDrawingFromId(null);
    }
  };

  useEffect(() => {
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, [drawingActive, drawingFromId, connections]);

  const handleNodeDragEnd = (id: string, info: any) => {
    cancelLongPress();
    const marginX = 400;
    const marginY = 250;
    
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    const newX = Math.max(-marginX, Math.min(marginX, node.x + info.offset.x));
    const newY = Math.max(-marginY, Math.min(200, node.y + info.offset.y));

    if (onNodeDragEnd) {
      onNodeDragEnd(id, newX, newY);
    } else if (setNodes) {
      setNodes(prev => prev.map(n => n.id === id ? { ...n, x: newX, y: newY } : n));
    }
  };

  return (
    <div 
      ref={containerRef}
      onPointerMove={handlePointerMove}
      className="relative w-full h-[calc(100vh-180px)] flex items-center justify-center overflow-hidden bg-transparent"
    >
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 max-w-sm w-full border border-slate-200 dark:border-slate-800"
            >
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2 font-outfit">연결을 삭제할까요?</h3>
              <p className="text-slate-600 dark:text-slate-400 text-center mb-8 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-slate-200 underline decoration-brand-primary decoration-2 underline-offset-4">{deleteConfirm.fromName}</span>와 
                <span className="font-semibold text-slate-900 dark:text-slate-200 underline decoration-brand-primary decoration-2 underline-offset-4 ml-1">{deleteConfirm.toName}</span> 사이의 관계를 끊으시겠습니까?
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    if (onDeleteConnection) onDeleteConnection(deleteConfirm.from, deleteConfirm.to);
                    setDeleteConfirm(null);
                  }}
                  className="px-6 py-3 bg-red-600 text-white rounded-2xl font-semibold hover:bg-red-700 shadow-lg shadow-red-500/30 transition-all active:scale-95"
                >
                  삭제하기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Decorative Background Rings */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        {[1, 2, 3].map((ring) => (
          <motion.div
            key={ring}
            initial={{ scale: 0, opacity: 0 }}
            animate={isLoaded ? { scale: 1, opacity: 0.1 } : {}}
            transition={{ duration: 1.5, delay: ring * 0.2, ease: "easeOut" }}
            style={{ width: `${ring * 300}px`, height: `${ring * 300}px` }}
            className="absolute border border-brand-primary rounded-full"
          />
        ))}
      </div>

      {/* SVG Connection Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
        <g style={{ transform: 'translate(50%, 50%)' }} className="pointer-events-none">
          <AnimatePresence>
              {isLoaded && connections.map((conn, idx) => {
                const startNode = conn.from === "me" ? { x: 0, y: 0 } : nodes.find(n => n.id === conn.from);
                const endNode = conn.to === "me" ? { x: 0, y: 0 } : nodes.find(n => n.id === conn.to);
                
                if (!startNode || !endNode) return null;
                
                const isMeConn = conn.from === "me" || conn.to === "me";
                const isActive = activeLine?.from === conn.from && activeLine?.to === conn.to;
                
                return (
                  <g 
                    key={`${conn.from}-${conn.to}-${idx}`}
                    onPointerDown={() => handleLinePointerDown(conn.from, conn.to)}
                    onPointerUp={cancelLineLongPress}
                    onPointerLeave={cancelLineLongPress}
                    onPointerCancel={cancelLineLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className="cursor-pointer pointer-events-auto"
                  >
                    {/* Invisible Thick Hit Area */}
                    <line
                      x1={startNode.x}
                      y1={startNode.y}
                      x2={endNode.x}
                      y2={endNode.y}
                      stroke="transparent"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />
                    <motion.line
                      initial={{ pathLength: 0, opacity: 0, strokeWidth: isMeConn ? 3 : 1.5 }}
                      animate={{ 
                        pathLength: 1, 
                        opacity: 1,
                        stroke: isActive ? "#ef4444" : (isMeConn ? "url(#lineGradient)" : "#94a3b8"),
                        strokeWidth: isActive ? 4 : (isMeConn ? 3 : 1.5)
                      }}
                      x1={startNode.x}
                      y1={startNode.y}
                      x2={endNode.x}
                      y2={endNode.y}
                      strokeLinecap="round"
                      className={isMeConn ? "drop-shadow-md" : "opacity-80"}
                    />
                  </g>
                );
              })}
          </AnimatePresence>
          
          {/* Drawing Line (Drag Interaction) */}
          {drawingActive && (
            <motion.line
              x1={drawingFromId === "me" ? 0 : nodes.find(n => n.id === drawingFromId)?.x || 0}
              y1={drawingFromId === "me" ? 0 : nodes.find(n => n.id === drawingFromId)?.y || 0}
              x2={drawX}
              y2={drawY}
              stroke="#3b82f6"
              strokeWidth="3"
              strokeDasharray="6 6"
              strokeLinecap="round"
              opacity={0.8}
            />
          )}
          
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </g>
      </svg>

      {/* Other Nodes */}
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
        <AnimatePresence>
          {nodes.map(node => {
            const nodeGroupIds = node.groupIds || (node.groupId ? [node.groupId] : []);
            const nodeGroups = nodeGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean) as GroupData[];
            
            const getBorderStyle = () => {
              if (nodeGroups.length === 0) return { border: '2px solid #e2e8f0' };
              if (nodeGroups.length === 1) return { border: `3px solid ${nodeGroups[0].color}`, boxShadow: `0 0 15px ${nodeGroups[0].color}40` };
              
              // 다중 그룹: conic-gradient 사용
              const colors = nodeGroups.map(g => g.color);
              let gradient = "conic-gradient(";
              colors.forEach((color, i) => {
                const start = (i / colors.length) * 360;
                const end = ((i + 1) / colors.length) * 360;
                gradient += `${color} ${start}deg ${end}deg${i === colors.length - 1 ? "" : ", "}`;
              });
              gradient += ")";
              
              return {
                background: gradient,
                padding: '3px',
                boxShadow: `0 4px 14px rgba(0,0,0,0.1)`
              };
            };

            const borderStyle = getBorderStyle();
            
            return (
              <motion.div
                key={node.id}
                data-node-id={node.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={nodesLoaded ? { scale: 1, opacity: 1, x: node.x, y: node.y } : { scale: 0, opacity: 0, x: node.x, y: node.y }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                drag
                dragConstraints={{ left: -400, right: 400, top: -250, bottom: 200 }}
                dragElastic={0.1}
                dragMomentum={false}
                onDragStart={() => {
                  cancelLongPress();
                  dragOccurred.current = true;
                }}
                onDragEnd={(e, info) => handleNodeDragEnd(node.id, info)}
                onPointerDown={() => handleNodePointerDown(node.id, node.x, node.y)}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onClick={(e) => {
                  if (onNodeClick && !dragOccurred.current && !drawingOccurred.current) {
                    onNodeClick(node.id);
                  }
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                whileDrag={{ scale: 1.1, zIndex: 50 }}
                className="absolute pointer-events-auto cursor-grab active:cursor-grabbing flex flex-col items-center group -translate-x-1/2 -translate-y-4"
                style={{ x: node.x, y: node.y, left: "50%", top: "50%" }} 
              >
                {/* Outer Circle (Border) */}
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden transition-all shadow-lg"
                  style={borderStyle}
                >
                  {/* Inner Content (Photo) */}
                  <div className="w-full h-full bg-white dark:bg-slate-800 rounded-full flex items-center justify-center overflow-hidden">
                    {node.photo ? (
                      <img src={node.photo} alt={node.name} className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      <Camera className="w-3 h-3 text-slate-300 dark:text-slate-500" />
                    )}
                  </div>
                </div>
                {/* Name Label */}
                <div 
                  className="mt-1 px-1.5 py-0.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full shadow-sm border border-slate-100 dark:border-slate-700"
                  style={nodeGroups.length === 1 ? { borderColor: `${nodeGroups[0].color}40` } : {}}
                >
                  <span className="text-[8px] leading-none font-bold text-slate-700 dark:text-slate-200">{node.name}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Center Node (Me) */}
      <motion.div
        data-node-id="me"
        initial={{ scale: 0, opacity: 0 }}
        animate={isLoaded ? { scale: 1, opacity: 1 } : {}}
        transition={{ type: "spring", damping: 15, stiffness: 100 }}
        onPointerDown={() => handleNodePointerDown("me", 0, 0)}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        whileTap={{ scale: 0.9 }}
        className="relative z-20 cursor-pointer pointer-events-auto"
      >
        {/* Outer Ring */}
        <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent rounded-full animate-spin-slow opacity-75"></div>

        {/* Node Body */}
        <div className="relative w-12 h-12 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-2xl border-2 border-white/50 dark:border-slate-800/50">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center mb-0.5">
              <User className="w-3 h-3 text-brand-primary" />
            </div>
            <span className="text-[10px] leading-none font-bold text-slate-900 dark:text-white font-outfit">나</span>
          </div>
        </div>
      </motion.div>

        {/* Floating Addition Labels (Decorative) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isLoaded ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.2 }}
          className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap"
        >
          <button
            onClick={onAddRelationship}
            className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 hover:scale-110 active:scale-95 transition-all cursor-pointer z-50"
          >
            <Plus className="w-4 h-4" />
            <span>관계 추가하기</span>
          </button>
        </motion.div>
    </div>
  );
}
