import { t, getField, getStudentName as _getStudentName, getErrorMessage } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Trash2, Edit2, Loader2, Upload, Download } from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb';
import FilterBar from '../../components/FilterBar';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, update, remove, nextId } from '../../lib/supabaseClient';
import { useFilterData } from '../../lib/useFilterData';
import { readCsvFile, pick } from '../../lib/adminCsv';
import { useSortable } from '../../lib/useSortable';
import { useColumnSearch } from '../../lib/useColumnSearch';
import SortableTh from '../../components/SortableTh';

export default function AdminSubjects() {
    const { lang, isAr } = useLang();

  const { addToast } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const hasRunFromState = useRef(false);
  const filterData = useFilterData(user, lang);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasApplied, setHasApplied] = useState(true); // Subjects loads initially per spec
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ subjectid: 'All', curriculumid: 'All', divisionid: 'All', stageid: 'All', classid: 'All' });
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState({ Subjectname_en: '', subjectname: '' });
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ Subjectname_en: '', subjectname: '' });
  const { sorted: sortedSubjects, sortCol, sortDir, handleSort } = useSortable(subjects, 'subjectid');
  const { columnSearch, activeSearch, setActiveSearch, setColumnSearch, applyColumnSearch } = useColumnSearch();
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [subList, assignments, classesTbl, sectionsTbl] = await Promise.all([
        rest('subjects_tbl', { select: '*' }),
        rest('employees_sections_subjects_classes_semisters_curriculums_tbl', { select: 'subjectid,classid,sectionid' }),
        rest('classes_tbl', { select: 'classid,classname' }),
        rest('sections_tbl', { select: 'sectionid,sectionname' }),
      ]);
      const enriched = subList.map((subject) => {
        const rows = assignments.filter((row) => row.subjectid === subject.subjectid);
        const labels = [...new Map(rows.map((row) => {
          const classRow = classesTbl.find((c) => c.classid === row.classid);
          const sectionRow = sectionsTbl.find((s) => s.sectionid === row.sectionid);
           const label = `${t('class', lang)} ${classRow?.classname || row.classid}${sectionRow ? ` - ${sectionRow.sectionname}` : ''}`;
          return [label, label];
        })).values()];
        return { ...subject, classes: labels };
      });
      setSubjects(enriched);
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, addToast, lang]);

  // Read URL params from dashboard card click and auto-apply
  useEffect(() => {
    if (!user || hasRunFromState.current) return;
    hasRunFromState.current = true;
    const keys = ['curriculumid','divisionid','stageid','classid','subjectid'];
    const fromUrl = {};
    const state = location.state || {};
    keys.forEach(k => { if (state[k]) fromUrl[k] = state[k]; });
    const merged = Object.keys(fromUrl).length > 0 ? { ...applied, ...fromUrl } : applied;
    if (Object.keys(fromUrl).length > 0) setApplied(merged);
    setHasApplied(true);
    fetchData();
  }, [fetchData, user]);


  const filtered = applyColumnSearch(sortedSubjects.filter((s) => {
    const ms = !search || getField(s, 'subjectname', 'Subjectname_en', lang)?.toLowerCase().includes(search.toLowerCase()) || s.subjectname?.toLowerCase().includes(search.toLowerCase());
    const msub = applied.subjectid === 'All' || String(s.subjectid) === applied.subjectid;
    return ms && msub;
  }));

  async function createSubject(payload) {
    const newId = await nextId('subjects_tbl', 'subjectid');
    await insert('subjects_tbl', {
      subjectid: newId,
      Subjectname_en: (payload.Subjectname_en || '').trim(),
      subjectname: (payload.subjectname || '').trim(),
    });
  }

  const handleCreate = async () => {
    if (!newRow.Subjectname_en.trim() || !newRow.subjectname.trim()) {
      addToast('Please fill in all required fields.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await createSubject(newRow);
      addToast(t('subjectAdded', lang), 'success');
      setNewRow({ Subjectname_en: '', subjectname: '' });
      setShowAddRow(false);
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const rows = await readCsvFile(file);
      for (const row of rows) {
        const payload = {
          Subjectname_en: pick(row, ['subjectname_en', 'subject (english)', 'subjectname', 'name']),
          subjectname: pick(row, ['subjectname', 'subject (arabic)', 'arabic']),
        };
        if (getField(payload, 'subjectname', 'Subjectname_en', lang)) await createSubject(payload);
      }
      addToast(t('subjectsCsvUploaded', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const openEdit = (subject) => {
    setSelected(subject);
    setForm({ Subjectname_en: subject.Subjectname_en || '', subjectname: subject.subjectname || '' });
  };

  const handleUpdate = async () => {
    if (!selected) return;
    setIsLoading(true);
    try {
      if (!form.Subjectname_en.trim() || !form.subjectname.trim()) {
        addToast('Please fill in all required fields.', 'warning');
        setIsLoading(false);
        return;
      }
      await update('subjects_tbl', selected.subjectid, 'subjectid', {
        Subjectname_en: form.Subjectname_en.trim(),
        subjectname: form.subjectname.trim(),
      });
      addToast(t('subjectUpdated', lang), 'success');
      setSelected(null);
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (subject) => {
    try {
      await remove('subjects_tbl', subject.subjectid, 'subjectid');
      addToast(t('subjectDeleted', lang), 'success');
      fetchData();
    } catch (e) {
      addToast(getErrorMessage(e, 'deleteSubject'), 'error');
    }
  };


    // Re-fetch when language changes
    useEffect(() => {
        const handler = () => { fetchData(); };
        window.addEventListener('langChanged', handler);
        return () => window.removeEventListener('langChanged', handler);
    }, [fetchData]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('subjects', lang)}</h1>
          <p className="text-[#64748b] text-sm">{t('academicCurriculum', lang)}</p>
          <Breadcrumb />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => {
              const headers = ['Subjectname_en','subjectname'];
              const sample  = [t('subjectEn', lang),t('subjectAr', lang)];
              const csv = [headers.join(','), sample.join(',')].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = t('subjectsTemplate', lang);
              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            }} className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2">
            <Download className="h-4 w-4" /> {t('downloadTemplate', lang)}
          </button>
          <label className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" /> {t('uploadCsv', lang)}
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
          <button onClick={() => { setShowAddRow(true); setSelected(null); }} className="btn-primary flex items-center gap-2 h-11 px-6"><Plus className="h-5 w-5" /> {t('addSubject', lang)}</button>
        </div>
      </div>

      <FilterBar
        filters={[
          { key: 'curriculumid', label: t('curriculum', lang), value: applied.curriculumid ?? 'All', options: filterData.curriculums || [] },
          { key: 'divisionid',   label: t('division', lang),   value: applied.divisionid   ?? 'All', options: filterData.divisions  || [] },
          { key: 'stageid',      label: t('stage', lang),      value: applied.stageid      ?? 'All', options: filterData.stages     || [] },
          { key: 'classid',      label: t('class', lang),      value: applied.classid      ?? 'All', options: filterData.classes    || [] },
          { key: 'subjectid',    label: t('subject', lang),    value: applied.subjectid    ?? 'All', options: filterData.subjects   || [] },
        ]}
        onApply={(vals) => { setApplied(vals); setHasApplied(true); fetchData(); }}
        onReset={(vals) => { setApplied({ subjectid: 'All', curriculumid: 'All', divisionid: 'All', stageid: 'All', classid: 'All' }); setHasApplied(false); setSubjects([]); }}
      />

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
          <input type="text" placeholder={t('searchSubjectsPlaceholder', lang)} className="input-field pl-10 h-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
        <div className="p-5 border-b border-[#e2e8f0] bg-slate-50 flex items-center gap-3"><h2 className="text-base font-bold text-[#0f172a]">{t('subjectsDirectory', lang)}</h2><span className="ml-auto text-xs text-[#94a3b8]">{filtered.length} {t('subjects', lang)}</span></div>
        <div className="overflow-x-auto" dir={isAr ? 'rtl' : 'ltr'}>
          <table className={`w-full ${isAr ? 'text-right' : 'text-left'}`}>
            <thead className="bg-slate-100 border-b-2 border-[#cbd5e1]">
              <tr>
                <SortableTh col="Subjectname_en" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-6 py-4 text-center font-bold text-[#1e293b]" searchValue={columnSearch['Subjectname_en']} isSearchOpen={activeSearch==='Subjectname_en'} onSearchOpen={()=>setActiveSearch('Subjectname_en')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('Subjectname_en','');}} onSearchChange={v=>setColumnSearch('Subjectname_en',v)}>{t('subject', lang)}</SortableTh>
                <th className="py-4 px-6 text-center font-bold text-[#1e293b] text-sm">{t('actions', lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {showAddRow && (
                <tr className="bg-blue-50/40 align-top">
                  <td className="py-3 px-6 text-center">
                    <div className="grid grid-cols-2 gap-3 min-w-[420px]">
                      <div>
                        <label className="text-xs font-bold text-[#64748b] mb-1 block">Subject Name (English) <span className="text-red-500">*</span></label>
                        <input required autoFocus type="text" placeholder={isAr ? "مثال: اللغة العربية" : "e.g. Arabic Language"} value={newRow.Subjectname_en} onChange={(e) => setNewRow((p) => ({ ...p, Subjectname_en: e.target.value }))} className="input-field h-10 w-full" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#64748b] mb-1 block">اسم المادة (عربي) <span className="text-red-500">*</span></label>
                        <input required type="text" dir="rtl" placeholder="مثال: اللغة العربية" value={newRow.subjectname} onChange={(e) => setNewRow((p) => ({ ...p, subjectname: e.target.value }))} className="input-field h-10 w-full" />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <button onClick={handleCreate} disabled={!newRow.Subjectname_en.trim() || !newRow.subjectname.trim() || isLoading} className="px-3 py-1.5 text-xs font-bold text-white bg-[#1d4ed8] rounded-lg disabled:opacity-60 disabled:cursor-not-allowed">{t('save', lang)}</button>
                      <button onClick={() => { setShowAddRow(false); setNewRow({ Subjectname_en: '', subjectname: '' }); }} className="px-3 py-1.5 text-xs font-bold text-[#64748b] bg-slate-100 rounded-lg">{t('cancel', lang)}</button>
                    </div>
                  </td>
                </tr>
              )}
              {loading ? (
                <tr><td colSpan={2} className="py-16 text-center text-[#94a3b8]"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={2} className="py-16 text-center text-[#94a3b8]">{t('noData', lang)}</td></tr>
              ) : filtered.map((subject) => (
                selected?.subjectid === subject.subjectid ? (
                  <tr key={subject.subjectid} className="bg-amber-50/50 align-top">
                    <td className="py-3 px-6 text-center">
                      <div className="grid grid-cols-2 gap-3 min-w-[420px]">
                        <div><label className="text-xs font-bold text-[#64748b] mb-1 block">Subject Name (English) <span className="text-red-500">*</span></label><input className="input-field h-10 w-full" value={form.Subjectname_en} onChange={(e) => setForm((p) => ({ ...p, Subjectname_en: e.target.value }))} /></div>
                        <div><label className="text-xs font-bold text-[#64748b] mb-1 block">اسم المادة (عربي) <span className="text-red-500">*</span></label><input className="input-field h-10 w-full" dir="rtl" value={form.subjectname} onChange={(e) => setForm((p) => ({ ...p, subjectname: e.target.value }))} /></div>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-center"><div className="flex justify-center gap-2"><button onClick={handleUpdate} className="px-3 py-1.5 text-xs font-bold text-white bg-[#1d4ed8] rounded-lg">{t('save', lang)}</button><button onClick={() => setSelected(null)} className="px-3 py-1.5 text-xs font-bold text-[#64748b] bg-slate-100 rounded-lg">{t('cancel', lang)}</button></div></td>
                  </tr>
                ) : (
                  <tr key={subject.subjectid} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6 text-center">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#0f172a]">{subject.Subjectname_en || '—'}</span>
                        <span className="text-xs text-[#64748b]" dir="rtl">{subject.subjectname || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => openEdit(subject)} className="p-1.5 text-[#1d4ed8] hover:bg-blue-50 rounded-lg"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(subject)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-50/50 border-t border-[#e2e8f0] flex items-center">
          <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider mr-3">{t('total', lang)}</span>
          <div className="px-3 py-1 bg-white rounded-lg border border-[#e2e8f0] text-xs font-black text-[#0f172a] shadow-sm">{filtered.length} {t('rows', lang)}</div>
        </div>
      </div>
      {isLoading && <div className="text-sm text-[#64748b]">{t('savingChanges', lang)}...</div>}
    </div>
  );
}
