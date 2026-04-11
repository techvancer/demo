import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Trash2, AlertTriangle, CheckCircle, Search, Filter } from 'lucide-react';
import FilterBar from '../../components/FilterBar';
import { useToast } from '../../context/ToastContext';
import { useSortable } from '../../lib/useSortable';
import SortableTh from '../../components/SortableTh';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, update, remove, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';
import { useFilterData } from '../../lib/useFilterData';
import { buildFilters, EMPTY_FILTER } from '../../lib/helpers';

export default function AdminExams() {
    const { lang, isAr } = useLang();

    const { addToast } = useToast();
    const { user } = useAuth();
    const filterData = useFilterData(user, lang);

    const [rows, setRows] = useState([]);
    const { sorted: sortedRows, sortCol, sortDir, handleSort } = useSortable(rows, 'examName');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [applied, setApplied] = useState({ ...EMPTY_FILTER, employeeid: 'All' });
    const [examTypes, setExamTypes] = useState([]);
    const [deleteModal, setDeleteModal] = useState({ show: false, row: null });

    const fetchData = useCallback(async (filters = {}) => {
        if (!user) return;
        try {
            setLoading(true);
            const f = (key, col) => filters[key] && filters[key] !== 'All' ? { [col || key]: `eq.${filters[key]}` } : {};
            const examQueryParams = {
                schoolid: `eq.${user.schoolid}`,
                branchid: `eq.${user.branchid}`,
                select: '*',
                ...f('classid'), ...f('sectionid'), ...f('subjectid'), ...f('examid'),
                ...f('curriculumid'), ...f('divisionid'), ...f('stageid'),
                ...(filters.employeeid && filters.employeeid !== 'All' ? { employeeid: `eq.${filters.employeeid}` } : {}),
            };
            const [stuExams, examList, clTbl, secRows, subList, empList] = await Promise.all([
                rest('students_exams_employees_section_subjects_classes_semisters_cur', examQueryParams),
                rest('exams_tbl', { select: '*' }),
                rest('classes_tbl', { select: '*' }),
                rest('sections_tbl', { select: '*' }),
                rest('subjects_tbl', { select: '*' }),
                rest('employee_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
            ]);

            // Deduplicate: one row per examid+classid+sectionid+subjectid+employeeid
            const seen = new Map();
            stuExams.forEach(r => {
                const key = `${r.examid}-${r.classid}-${r.sectionid}-${r.subjectid}-${r.employeeid}`;
                if (!seen.has(key)) {
                    const exam = examList.find(e => e.examid === r.examid);
                    const cl = clTbl.find(c => c.classid === r.classid);
                    const sec = secRows.find(s => s.sectionid === r.sectionid);
                    const sub = subList.find(s => s.subjectid === r.subjectid);
                    const emp = empList.find(e => e.employeeid === r.employeeid);
                    seen.set(key, {
                        _key: key,
                        examid: r.examid,
                        classid: r.classid,
                        sectionid: r.sectionid,
                        subjectid: r.subjectid,
                        employeeid: r.employeeid,
                        examName: getField(exam, 'examname', 'examname_en', lang) || '—',
                        examNameAr: exam?.examname || '',
                        classname: getField(cl, 'classname', 'classname_en', lang) || cl?.classname || '?',
                        sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || '?',
                        subjectName: getField(sub, 'subjectname', 'Subjectname_en', lang) || '—',
                        teacherName: getField(emp, 'employeename', 'employeename_en', lang) || emp?.employeename || '—',
                        studentCount: 0,
                    });
                }
                seen.get(key).studentCount++;
            });

            const enriched = [...seen.values()];
            setRows(enriched);
            const types = [...new Set(enriched.map(r => r.examName))].filter(Boolean);
            setExamTypes(types);
        } catch (e) { addToast(e.message, 'error'); }
        finally { setLoading(false); }
    }, [user]);


    const [hasApplied, setHasApplied] = useState(false);

    const filtered = sortedRows.filter(r => {
        const q = search.toLowerCase();
        const matchSearch = !search ||
            r.examName?.toLowerCase().includes(q) ||
            r.subjectName?.toLowerCase().includes(q) ||
            r.teacherName?.toLowerCase().includes(q) ||
            r.classname?.includes(search);
        const mc = applied.classid === 'All' || String(r.classid) === applied.classid;
        const ms = applied.sectionid === 'All' || String(r.sectionid) === applied.sectionid;
        const msub = applied.subjectid === 'All' || String(r.subjectid) === applied.subjectid;
        const mex = applied.examid === 'All' || String(r.examid) === applied.examid;
        const mem = applied.employeeid === 'All' || String(r.employeeid) === applied.employeeid;
        return matchSearch && mc && ms && msub && mex && mem;
    });

    const handleDelete = async () => {
        const row = deleteModal.row;
        if (!row) return;
        try {
            await fetch(
                `${SUPABASE_URL}/rest/v1/students_exams_employees_section_subjects_classes_semisters_cur` +
                `?examid=eq.${row.examid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}` +
                `&subjectid=eq.${row.subjectid}&employeeid=eq.${row.employeeid}`,
                { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
            );
            addToast(t('examEntryDeleted', lang), 'success');
            setDeleteModal({ show: false, row: null });
            fetchData();
        } catch (err) { addToast(err.message, 'error'); }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('examsCentral', lang)}</h1>
                    <p className="text-[#64748b] text-sm font-medium">{t('manageExamsDesc', lang)}</p>
                </div>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-lg text-sm font-medium">
                    <span className="text-base">ℹ️</span>
                    {t('examsCreatedByTeachers', lang)}
                </div>
            </div>

            {/* Filters */}
            <FilterBar
                filters={[...buildFilters(applied, filterData, {}, lang), { key: 'employeeid', label: t('teacher', lang), value: applied.employeeid ?? 'All', options: filterData.employees || [] }]}
                onApply={vals => { setApplied(vals); setHasApplied(true); fetchData(vals); }}
                onReset={vals => { setApplied({ ...vals, employeeid: 'All' }); setHasApplied(false); setRows([]); }}
            />
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex items-center gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <input type="text" placeholder={t('searchAdminExamsPlaceholder', lang)} className="input-field pl-10 h-10 w-full" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden bg-white border-[#e2e8f0] rounded-xl shadow-sm">
                <div className="p-6 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center gap-3">
                    <ClipboardList className="h-5 w-5 text-[#1d4ed8]" />
                    <h2 className="text-base font-bold text-[#0f172a]">{t('examsDirectory', lang)}</h2>
                    <span className="ml-auto text-xs text-[#94a3b8] font-medium">{filtered.length} {t('exams', lang)}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                            <tr className="text-[#64748b] text-xs font-bold uppercase tracking-wider">
                                <SortableTh col="classname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-6">{t('class', lang)}</SortableTh>
                                <th className="px-6 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('section', lang)}</th>
                                <th className="px-6 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('subject', lang)}</th>
                                <SortableTh col="examName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-6">{t('exam', lang)}</SortableTh>
                                <th className="px-6 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('teacher', lang)}</th>
                                <th className="px-6 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('students', lang)}</th>
                                <th className="px-6 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider text-right">{t('action', lang)}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                            {!hasApplied && (
                                <tr><td colSpan={7} className="px-6 py-20 text-center text-[#94a3b8] font-medium">{t('pressApplyToLoad', lang)}</td></tr>
                            )}
                            {hasApplied && loading && (
                                <tr><td colSpan={7} className="px-6 py-16 text-center text-[#94a3b8]">{t('loading', lang)}</td></tr>
                            )}
                            {hasApplied && !loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <ClipboardList className="h-10 w-10 text-slate-200" />
                                            <p className="text-slate-400 font-medium">{t('noData', lang)}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {hasApplied && !loading && filtered.length > 0 && (
                                <AnimatePresence initial={false}>
                                    {filtered.map((row) => (
                                        <motion.tr
                                            key={row._key}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="hover:bg-blue-50/20 transition-colors"
                                        >
                                            <td className="px-6 py-4 text-sm font-bold text-[#0f172a]">{t('class', lang)} {row.classname}</td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center justify-center w-8 h-8 bg-slate-100 rounded-lg text-xs font-black text-[#475569] border border-slate-200">
                                                    {row.sectionname}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-[#475569] font-medium">{row.subjectName}</td>
                                            <td className="px-6 py-4">
                                                <div>
                                                    <span className="text-sm font-bold text-[#0f172a]">{row.examName}</span>
                                                    {row.examNameAr && (
                                                        <p className="text-[10px] text-[#94a3b8] mt-0.5" dir="rtl">{row.examNameAr}</p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-[#475569]">{row.teacherName}</td>
                                            <td className="px-6 py-4">
                                                <span className="flex items-center gap-1.5 text-[#10b981] text-xs font-bold bg-green-50 px-2.5 py-1 rounded-full border border-green-100 w-fit">
                                                    <CheckCircle className="h-3 w-3" /> {row.studentCount}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => setDeleteModal({ show: true, row })}
                                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Modal */}
            <AnimatePresence>
                {deleteModal.show && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setDeleteModal({ show: false, row: null })} />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl z-10 p-8 text-center relative">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-[#0f172a] mb-2">{t('deleteExamEntry', lang)}</h3>
                            <p className="text-[#64748b] text-sm mb-8 leading-relaxed">
                                {t('delete', lang)} <span className="font-bold text-[#0f172a]">{deleteModal.row?.examName}</span> —{' '}
                                <span className="font-bold">{deleteModal.row?.subjectName}</span> {t('for', lang)} {t('grade', lang)}{' '}
                                <span className="font-bold">{deleteModal.row?.classname}-{deleteModal.row?.sectionname}</span>?
                            </p>
                            <div className="flex gap-4">
                                <button onClick={() => setDeleteModal({ show: false, row: null })} className="flex-1 py-3 font-bold text-slate-600 hover:bg-slate-50 rounded-xl">{t('cancel', lang)}</button>
                                <button onClick={handleDelete} className="flex-1 py-3 font-bold bg-red-600 text-white hover:bg-red-700 rounded-xl">{t('delete', lang)}</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
