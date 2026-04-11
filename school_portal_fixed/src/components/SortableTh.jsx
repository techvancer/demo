/**
 * SortableTh — sortable AND filterable table header cell.
 *
 * Usage:
 *   <SortableTh col="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}
 *               filterValue={colFilters.name} onFilter={(val) => setColFilters(p=>({...p,name:val}))}>
 *     Name
 *   </SortableTh>
 *
 * If `onFilter` is not provided, the column is sort-only (no filter icon).
 */
import { useState, useRef, useEffect } from 'react';
import { Filter, X } from 'lucide-react';

export default function SortableTh({
    col,
    sortCol,
    sortDir,
    onSort,
    filterValue = '',
    onFilter,
    children,
    className = '',
}) {
    const active = sortCol === col;
    const hasFilter = typeof onFilter === 'function';
    const isFiltered = hasFilter && filterValue && filterValue !== '';

    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(filterValue || '');
    const inputRef = useRef(null);
    const containerRef = useRef(null);

    // Sync draft when filterValue changes (e.g. external reset)
    useEffect(() => { setDraft(filterValue || ''); }, [filterValue]);

    // Focus input when popup opens
    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const applyFilter = () => {
        onFilter(draft);
        setOpen(false);
    };

    const clearFilter = (e) => {
        e.stopPropagation();
        setDraft('');
        onFilter('');
        setOpen(false);
    };

    return (
        <th
            className={`py-4 px-6 text-xs font-black text-[#64748b] uppercase tracking-wider select-none group whitespace-nowrap ${className}`}
            ref={containerRef}
            style={{ position: 'relative' }}
        >
            <span className="flex items-center gap-1.5">
                {/* Sort area */}
                <span
                    onClick={() => onSort(col)}
                    className="flex items-center gap-1 cursor-pointer hover:text-[#1d4ed8] transition-colors"
                >
                    {children}
                    <span className={`transition-all text-[10px] ${active ? 'text-[#1d4ed8]' : 'text-[#cbd5e1] group-hover:text-[#94a3b8]'}`}>
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                </span>

                {/* Filter toggle */}
                {hasFilter && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                        className={`p-0.5 rounded transition-colors ${isFiltered ? 'text-[#1d4ed8]' : 'text-[#cbd5e1] hover:text-[#64748b]'}`}
                        title="Filter this column"
                    >
                        <Filter className="h-3 w-3" />
                    </button>
                )}
            </span>

            {/* Filter dropdown */}
            {open && (
                <div
                    className="absolute z-50 top-full left-0 mt-1 bg-white border border-[#e2e8f0] rounded-xl shadow-xl p-3 min-w-[200px]"
                    onClick={e => e.stopPropagation()}
                >
                    <p className="text-[10px] font-bold text-[#64748b] uppercase mb-2">Filter: {children}</p>
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full h-8 px-2 text-xs border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/30 mb-2"
                        placeholder="Type to search..."
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyFilter(); if (e.key === 'Escape') setOpen(false); }}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={applyFilter}
                            className="flex-1 h-7 bg-[#1d4ed8] text-white text-[11px] font-bold rounded-lg hover:bg-[#1e40af] transition-colors"
                        >
                            Apply
                        </button>
                        {isFiltered && (
                            <button
                                onClick={clearFilter}
                                className="h-7 px-2 border border-[#e2e8f0] text-[#64748b] text-[11px] rounded-lg hover:bg-slate-50 flex items-center gap-1"
                            >
                                <X className="h-3 w-3" /> Clear
                            </button>
                        )}
                    </div>
                </div>
            )}
        </th>
    );
}
