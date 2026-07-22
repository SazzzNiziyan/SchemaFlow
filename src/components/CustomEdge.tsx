import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';

export const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex flex-col items-center gap-1 z-50"
        >
          <button
            className="w-5 h-5 bg-[#1a1a1a] border border-neutral-700 hover:border-red-500 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-full flex items-center justify-center cursor-pointer transition-colors shadow-lg"
            onClick={(event) => {
              event.stopPropagation();
              if (data && typeof data.onDelete === 'function') {
                data.onDelete(id);
              }
            }}
          >
            <X className="w-3 h-3" />
          </button>
          {data && typeof data.relType === 'string' && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-900/40 border border-indigo-500/30 text-[10px] font-mono text-indigo-300 font-bold backdrop-blur-md shadow-lg pointer-events-none">
              {data.relType}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
