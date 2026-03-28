import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

type ElementTreeProps = {
  canvasEl: HTMLElement | null;
  selectedEl: HTMLElement | null;
  isDark: boolean;
  onSelectElement: (el: HTMLElement) => void;
  onDeleteElement?: (el: HTMLElement) => void;
  onDuplicateElement?: (el: HTMLElement) => void;
  onWrapElement?: (el: HTMLElement) => void;
  onInsertElement?: (el: HTMLElement, position: 'before' | 'after' | 'inside') => void;
};

interface TreeNode {
  el: HTMLElement;
  tag: string;
  id: string;
  classes: string[];
  textPreview: string;
  children: TreeNode[];
  depth: number;
}

function buildTree(root: HTMLElement, depth = 0): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i] as HTMLElement;
    if (!child.getAttribute) continue;
    if (child.getAttribute('data-live-ui-overlay') === '1') continue;

    const hasSource =
      child.hasAttribute('data-source-file') && child.hasAttribute('data-source-line');

    const childNodes = buildTree(child, depth + (hasSource ? 1 : 0));

    if (hasSource) {
      const tag = child.tagName.toLowerCase();
      const id = child.id || '';
      const classList = Array.from(child.classList).slice(0, 3);
      let text = '';
      for (let c = 0; c < child.childNodes.length; c++) {
        if (child.childNodes[c].nodeType === Node.TEXT_NODE) {
          const t = (child.childNodes[c].textContent || '').trim();
          if (t) { text = t; break; }
        }
      }
      if (text.length > 30) text = text.slice(0, 30) + '…';

      nodes.push({ el: child, tag, id, classes: classList, textPreview: text, children: childNodes, depth });
    } else {
      nodes.push(...childNodes);
    }
  }
  return nodes;
}

function flattenNodes(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const n of nodes) {
    result.push(n);
    result.push(...flattenNodes(n.children));
  }
  return result;
}

function matchesFilter(node: TreeNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.tag.includes(q)) return true;
  if (node.id.toLowerCase().includes(q)) return true;
  if (node.classes.some(c => c.toLowerCase().includes(q))) return true;
  if (node.textPreview.toLowerCase().includes(q)) return true;
  return false;
}

function hasMatchingDescendant(node: TreeNode, query: string): boolean {
  if (matchesFilter(node, query)) return true;
  return node.children.some(c => hasMatchingDescendant(c, query));
}

const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function TreeNodeRow({
  node,
  selectedEl,
  isDark,
  expandedSet,
  onToggle,
  onSelect,
  onDelete,
  onDuplicate,
  onWrap,
  onInsert,
  filterQuery,
  nodeRef,
}: {
  node: TreeNode;
  selectedEl: HTMLElement | null;
  isDark: boolean;
  expandedSet: Set<HTMLElement>;
  onToggle: (el: HTMLElement) => void;
  onSelect: (el: HTMLElement) => void;
  onDelete?: (el: HTMLElement) => void;
  onDuplicate?: (el: HTMLElement) => void;
  onWrap?: (el: HTMLElement) => void;
  onInsert?: (el: HTMLElement, position: 'before' | 'after' | 'inside') => void;
  filterQuery: string;
  nodeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHovered] = useState(false);
  const isSelected = node.el === selectedEl;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedSet.has(node.el);

  const filteredChildren = filterQuery
    ? node.children.filter(c => hasMatchingDescendant(c, filterQuery))
    : node.children;

  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 4px 2px 0',
    paddingLeft: node.depth * 16 + 4,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: '20px',
    borderLeft: isSelected ? '2px solid rgba(45,212,191,0.8)' : '2px solid transparent',
    background: isSelected
      ? 'rgba(45,212,191,0.15)'
      : hovered
        ? isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
        : 'transparent',
    borderRadius: 2,
    position: 'relative',
    minHeight: 22,
    userSelect: 'none',
  };

  const tagStyle: React.CSSProperties = {
    fontFamily: MONO_FONT,
    color: isDark ? 'rgba(45,212,191,0.95)' : 'rgba(13,148,136,0.9)',
    fontWeight: 600,
    fontSize: 11.5,
    flexShrink: 0,
  };

  const idStyle: React.CSSProperties = {
    fontFamily: MONO_FONT,
    color: isDark ? 'rgba(251,191,36,0.9)' : 'rgba(180,83,9,0.9)',
    fontSize: 11,
    marginLeft: 2,
    flexShrink: 0,
  };

  const classStyle: React.CSSProperties = {
    fontFamily: MONO_FONT,
    color: isDark ? 'rgba(124,58,237,0.7)' : 'rgba(109,40,217,0.65)',
    fontSize: 10.5,
    marginLeft: 3,
    flexShrink: 0,
    maxWidth: 90,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const textStyle: React.CSSProperties = {
    color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    fontSize: 10.5,
    marginLeft: 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  };

  const arrowStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
    flexShrink: 0,
    transition: 'transform 0.12s ease',
  };

  const actionBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: 11,
    lineHeight: 1,
    opacity: 0.7,
    color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
  };

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.el);
  }, [node.el, onSelect]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(node.el);
  }, [node.el, onToggle]);

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected} aria-level={node.depth + 1}>
      <div
        ref={isSelected ? nodeRef : undefined}
        style={rowStyle}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hasChildren ? (
          <span style={arrowStyle} onClick={handleToggle}>
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ ...arrowStyle, visibility: 'hidden' }}>▶</span>
        )}
        <span style={tagStyle}>{node.tag}</span>
        {node.id && <span style={idStyle}>#{node.id}</span>}
        {node.classes.length > 0 && (
          <span style={classStyle}>.{node.classes.join('.')}</span>
        )}
        {node.textPreview && <span style={textStyle}>"{node.textPreview}"</span>}
        {hovered && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto', flexShrink: 0, paddingLeft: 4 }}>
            {onDelete && (
              <button style={actionBtnStyle} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(node.el); }}>🗑️</button>
            )}
            {onInsert && (
              <button style={actionBtnStyle} title="Insert After" onClick={(e) => { e.stopPropagation(); onInsert(node.el, 'after'); }}>⊕</button>
            )}
            {onDuplicate && (
              <button style={actionBtnStyle} title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(node.el); }}>⧉</button>
            )}
            {onWrap && (
              <button style={actionBtnStyle} title="Wrap in div" onClick={(e) => { e.stopPropagation(); onWrap(node.el); }}>□</button>
            )}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && filteredChildren.length > 0 && (
        <div role="group">
          {filteredChildren.map((child, i) => (
            <TreeNodeRow
              key={`${child.tag}-${child.id || ''}-${i}`}
              node={child}
              selectedEl={selectedEl}
              isDark={isDark}
              expandedSet={expandedSet}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onWrap={onWrap}
              onInsert={onInsert}
              filterQuery={filterQuery}
              nodeRef={nodeRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ElementTree({
  canvasEl,
  selectedEl,
  isDark,
  onSelectElement,
  onDeleteElement,
  onDuplicateElement,
  onWrapElement,
  onInsertElement,
}: ElementTreeProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedSet, setExpandedSet] = useState<Set<HTMLElement>>(new Set());
  const [treeVersion, setTreeVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedNodeRef = useRef<HTMLDivElement>(null);
  const initialExpandDone = useRef(false);

  const tree = useMemo(() => {
    // treeVersion is used to trigger rebuild
    void treeVersion;
    if (!canvasEl) return [];
    return buildTree(canvasEl);
  }, [canvasEl, treeVersion]);

  // Default expand first 2 levels
  useEffect(() => {
    if (tree.length === 0 || initialExpandDone.current) return;
    const set = new Set<HTMLElement>();
    for (const node of tree) {
      set.add(node.el);
      for (const child of node.children) {
        set.add(child.el);
      }
    }
    setExpandedSet(set);
    initialExpandDone.current = true;
  }, [tree]);

  // Auto-expand to selected element
  useEffect(() => {
    if (!selectedEl || !canvasEl) return;
    const allNodes = flattenNodes(tree);
    const selectedNode = allNodes.find(n => n.el === selectedEl);
    if (!selectedNode) return;

    // Walk up DOM to expand ancestors
    setExpandedSet(prev => {
      const next = new Set(prev);
      let el: HTMLElement | null = selectedEl.parentElement;
      while (el && el !== canvasEl) {
        if (el.hasAttribute('data-source-file')) next.add(el);
        el = el.parentElement;
      }
      return next;
    });
  }, [selectedEl, canvasEl, tree]);

  // Auto-scroll to selected node
  useEffect(() => {
    if (!selectedEl) return;
    const timer = setTimeout(() => {
      selectedNodeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedEl]);

  // MutationObserver to rebuild tree on DOM changes
  useEffect(() => {
    if (!canvasEl) return;
    const observer = new MutationObserver(() => {
      setTreeVersion(v => v + 1);
    });
    observer.observe(canvasEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id', 'data-source-file', 'data-source-line'] });
    return () => observer.disconnect();
  }, [canvasEl]);

  const handleToggle = useCallback((el: HTMLElement) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(el)) next.delete(el);
      else next.add(el);
      return next;
    });
  }, []);

  const handleSelect = useCallback((el: HTMLElement) => {
    onSelectElement(el);
  }, [onSelectElement]);

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(e.target.value);
  }, []);

  // When filter is active, auto-expand matching branches
  const displayedTree = useMemo(() => {
    if (!filterQuery) return tree;
    return tree.filter(n => hasMatchingDescendant(n, filterQuery));
  }, [tree, filterQuery]);

  // Auto-expand all when filtering
  useEffect(() => {
    if (!filterQuery) return;
    const allNodes = flattenNodes(tree);
    const matching = allNodes.filter(n => hasMatchingDescendant(n, filterQuery));
    setExpandedSet(prev => {
      const next = new Set(prev);
      for (const n of matching) next.add(n.el);
      return next;
    });
  }, [filterQuery, tree]);

  const borderColor = isDark ? 'rgba(45,212,191,0.20)' : 'rgba(20,184,166,0.22)';
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)';
  const bgColor = isDark ? 'rgba(10,10,18,0.3)' : 'rgba(255,255,255,0.6)';

  const containerStyle: React.CSSProperties = {
    width: 260,
    height: '100%',
    overflow: 'auto',
    borderRight: `1px solid ${borderColor}`,
    background: bgColor,
    color: textColor,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
  };

  const searchStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '4px 8px',
    fontSize: 11,
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    color: textColor,
    outline: 'none',
    fontFamily: MONO_FONT,
  };

  const headerStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderBottom: `1px solid ${borderColor}`,
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
    marginBottom: 4,
  };

  return (
    <div data-live-ui-overlay="1" ref={containerRef} style={containerStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>Elements</div>
        <input
          type="text"
          placeholder="Search elements…"
          value={filterQuery}
          onChange={handleFilterChange}
          style={searchStyle}
          aria-label="Filter element tree"
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }} role="tree" aria-label="Element tree">
        {displayedTree.length === 0 && (
          <div style={{ padding: '12px 8px', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', fontSize: 11, textAlign: 'center' }}>
            {canvasEl ? (filterQuery ? 'No matching elements' : 'No source-mapped elements found') : 'No canvas loaded'}
          </div>
        )}
        {displayedTree.map((node, i) => (
          <TreeNodeRow
            key={`${node.tag}-${node.id || ''}-${i}`}
            node={node}
            selectedEl={selectedEl}
            isDark={isDark}
            expandedSet={expandedSet}
            onToggle={handleToggle}
            onSelect={handleSelect}
            onDelete={onDeleteElement}
            onDuplicate={onDuplicateElement}
            onWrap={onWrapElement}
            onInsert={onInsertElement}
            filterQuery={filterQuery}
            nodeRef={selectedNodeRef}
          />
        ))}
      </div>
    </div>
  );
}

export { ElementTree };
export default ElementTree;
