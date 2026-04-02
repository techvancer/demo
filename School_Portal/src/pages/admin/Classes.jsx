import { t, getField, getErrorMessage } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Loader2, Search, Upload, Download, Edit2 } from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb';
import FilterBar from '../../components/FilterBar';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';
import { useFilterData } from '../../lib/useFilterData';
import { buildFilters } from '../../lib/helpers';
import { readCsvFile, pick } from '../../lib/adminCsv';
import { useSortable } from '../../lib/useSortable';
import { useColumnSearch } from '../../lib/useColumnSearch';
import SortableTh from '../../components/SortableTh';

const EMPTY_CLASS = { classid: '', sectionid: '', stageid: '', divisionid: '', curriculumid: '' };

export default function AdminClasses() {
  const { lang, isAr } = useLang();
  const { addToast } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const hasRunFromState = useRef(false);
  const filterData = useFilterData(user, lang);
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [stages, setStages] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [curriculums, setCurriculums] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ classid: 'All', sectionid: 'All', stageid: 'All', curriculumid: 'All', divisionid: 'All' });
  const [showAddRow, setShowAddRow] = useState(false);
  const [classForm, setClassForm] = useState(EMPTY_CLASS);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_CLASS);
  const [isLoading, setIsLoading] = useState(false);
  const { sorted: sortedRows, sortCol, sortDir, handleSort } = useSortable(rows, 'classid');
  const { columnSearch, activeSearch, setActiveSearch, setColumnSearch, applyColumnSearch } = useColumnSearch();

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [scRows, classRows, secRows, stageRows, stuScRows, divRows, curRows] = await Promise.all([
        rest('sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
        rest('classes_tbl', { select: '*' }),
        rest('sections_tbl', { select: '*' }),
        rest('stages_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
        rest('students_sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: 'classid,sectionid,studentid' }),
        rest('divisions_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }).catch(() => []),
        rest('curriculums_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }).catch(() => []),
      ]);
      const merged = scRows.map((sc) => {
        const cl = classRows.find((c) => c.classid === sc.classid);
        const sec = secRows.find((s) => s.sectionid === sc.sectionid);
        const stage = stageRows.find((s) => s.stageid === sc.stageid);
        const div = (divRows || []).find((d) => d.divisionid === sc.divisionid);
        const cur = (curRows || []).find((c) => c.curriculumid === sc.curriculumid);
        const studentCount = stuScRows.filter((row) => row.classid === sc.classid && row.sectionid === sc.sectionid).length;
        return {
          ...sc,
          classDisplay: lang === 'ar' ? (cl?.classname || sc.classid) : (cl?.classname_en || cl?.classname || sc.classid),
          classname: cl?.classname || sc.classid,
          classname_en: cl?.classname_en || cl?.classname || sc.classid,
          sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || String(sc.sectionid),
          stagename: lang === 'ar' ? (stage?.stagename || stage?.stagename_en || '—') : (stage?.stagename_en || stage?.stagename || '—'),
          divisionname: getField(div, 'divisionname', 'divisionname_en', lang) || '—',
          curriculumname: getField(cur, 'curriculumname', 'curriculumname_en', lang) || '—',
          studentCount,
        };
      });
      setRows(merged);
      setClasses(classRows);
      setSections(secRows);
      setStages([...new Map(stageRows.map((s) => [s.stageid, s])).values()]);
      setDivisions(divRows || []);
      setCurriculums(curRows || []);
    } catch (e) {
      addToast(getErrorMessage(e, 'deleteClass'), 'error');
    } finally {
      setLoading(false);
    }
  }, [user, addToast, lang]);

  useEffect(() => {
    if (!user || hasRunFromState.current) return;
    hasRunFromState.current = true;
    const keys = ['curriculumid', 'divisionid', 'stageid', 'classid', 'sectionid'];
    const fromUrl = {};
    const state = location.state || {};
    keys.forEach((k) => { if (state[k]) fromUrl[k] = state[k]; });
    const merged = Object.keys(fromUrl).length > 0 ? { ...applied, ...fromUrl } : applied;
    if (Object.keys(fromUrl).length > 0) setApplied(merged);
    setHasApplied(true);
    fetchData();
  }, [fetchData, user]);

  const filtered = applyColumnSearch(sortedRows.filter((row) => {
    const q = search.toLowerCase();
    const ms = !search || row.classDisplay.toLowerCase().includes(q) || String(row.sectionname).toLowerCase().includes(q);
    const mc = applied.classid === 'All' || String(row.classid) === applied.classid;
    const msec = applied.sectionid === 'All' || String(row.sectionid) === applied.sectionid;
    const mst = applied.stageid === 'All' || String(row.stageid) === applied.stageid;
    const mdiv = applied.divisionid === 'All' || String(row.divisionid) === applied.divisionid;
    const mcur = applied.curriculumid === 'All' || String(row.curriculumid) === applied.curriculumid;
    return ms && mc && msec && mst && mdiv && mcur;
  }));

  const isClassFormValid = Boolean(classForm.classid && classForm.sectionid && classForm.stageid && classForm.divisionid && classForm.curriculumid);

  async function createClassRow(payload) {
    await insert('sections_classes_tbl', {
      classid: Number.parseInt(payload.classid, 10),
      sectionid: Number.parseInt(payload.sectionid, 10),
      stageid: Number.parseInt(payload.stageid, 10),
      divisionid: Number.parseInt(payload.divisionid, 10),
      curriculumid: Number.parseInt(payload.curriculumid, 10),
      branchid: user.branchid,
      schoolid: user.schoolid,
    });
  }

  const handleCreate = async () => {
    if (!isClassFormValid) {
      addToast('All fields are required.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await createClassRow(classForm);
      addToast(t('classAdded', lang), 'success');
      setShowAddRow(false);
      setClassForm(EMPTY_CLASS);
      fetchData();
    } catch (err) {
      addToast(getErrorMessage(err, 'general'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const csvRows = await readCsvFile(file);
      for (const row of csvRows) {
        const payload = {
          classid: pick(row, ['classid']),
          sectionid: pick(row, ['sectionid']),
          stageid: pick(row, ['stageid']),
          divisionid: pick(row, ['divisionid']),
          curriculumid: pick(row, ['curriculumid']),
        };
        if (payload.classid && payload.sectionid && payload.stageid && payload.divisionid && payload.curriculumid) await createClassRow(payload);
      }
      addToast(t('classesCsvUploaded', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(getErrorMessage(err, 'general'), 'error');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const openEdit = (row) => {
    setSelectedRow(row);
    setEditForm({
      classid: String(row.classid || ''),
      sectionid: String(row.sectionid || ''),
      stageid: String(row.stageid || ''),
      divisionid: String(row.divisionid || ''),
      curriculumid: String(row.curriculumid || ''),
    });
  };

  const handleUpdate = async () => {
    if (!selectedRow) return;
    if (!editForm.classid || !editForm.sectionid || !editForm.stageid || !editForm.divisionid || !editForm.curriculumid) {
      addToast('Please fill in all required fields.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/sections_classes_tbl?classid=eq.${selectedRow.classid}&sectionid=eq.${selectedRow.sectionid}&stageid=eq.${selectedRow.stageid}&schoolid=eq.${user.schoolid}&branchid=eq.${user.branchid}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      await createClassRow(editForm);
      addToast(t('savingChanges', lang), 'success');
      setSelectedRow(null);
      fetchData();
    } catch (err) {
      addToast(getErrorMessage(err, 'general'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (row) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/sections_classes_tbl?classid=eq.${row.classid}&sectionid=eq.${row.sectionid}&schoolid=eq.${user.schoolid}&branchid=eq.${user.branchid}`, {
        method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      addToast(t('classRowDeleted', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(getErrorMessage(err, 'deleteClass'), 'error');
    }
  };


    useEffect(() => {
        if (!hasApplied) return;
        fetchData();
    }, [lang, hasApplied, fetchData]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('classes', lang)}</h1>
          <p className="text-[#64748b] text-sm">{t('allGradesInBranch', lang)}</p>
          <Breadcrumb />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => {
              const headers = ['classid','sectionid','stageid','divisionid','curriculumid'];
              const sample  = ['1','1','1','1','1'];
              const csv = [headers.join(','), sample.join(',')].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = t('classesTemplate', lang);
              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            }} className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2">
            <Download className="h-4 w-4" /> {t('downloadTemplate', lang)}
          </button>
          <label className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" /> {t('uploadCsv', lang)}
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
          <button onClick={() => { setShowAddRow(true); setSelectedRow(null); }} className="btn-primary flex items-center gap-2 h-11 px-6"><Plus className="h-5 w-5" /> {t('newClass', lang)}</button>
        </div>
      </div>

      <FilterBar
        filters={buildFilters(applied, filterData, {}, lang).filter((f) => ['curriculumid','divisionid','stageid','classid','sectionid'].includes(f.key))}
        appliedFilters={applied}

        onApply={(vals) => { setApplied(vals); setHasApplied(true); fetchData(vals); }}
        onReset={(vals) => { setApplied({ classid: 'All', sectionid: 'All', stageid: 'All', curriculumid: 'All', divisionid: 'All' }); setHasApplied(false); setRows([]); }}
      />

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
          <input type="text" placeholder={t('searchClassesPlaceholder', lang)} className="input-field pl-10 h-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-white overflow-hidden rounded-xl border border-[#e2e8f0]">
        <div className="overflow-x-auto" dir={isAr ? 'rtl' : 'ltr'}>
          <table className={`w-full ${isAr ? 'text-right' : 'text-left'}`}>
            <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]"><tr>
                <SortableTh col="classname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['classname']} isSearchOpen={activeSearch==='classname'} onSearchOpen={()=>setActiveSearch('classname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('classname','');}} onSearchChange={v=>setColumnSearch('classname',v)}>{t('classes', lang)}</SortableTh>
                <SortableTh col="sectionname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['sectionname']} isSearchOpen={activeSearch==='sectionname'} onSearchOpen={()=>setActiveSearch('sectionname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('sectionname','');}} onSearchChange={v=>setColumnSearch('sectionname',v)}>{t('section', lang)}</SortableTh>
                <SortableTh col="stagename" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['stagename']} isSearchOpen={activeSearch==='stagename'} onSearchOpen={()=>setActiveSearch('stagename')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('stagename','');}} onSearchChange={v=>setColumnSearch('stagename',v)}>{t('stage', lang)}</SortableTh>
                <SortableTh col="divisionname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['divisionname']} isSearchOpen={activeSearch==='divisionname'} onSearchOpen={()=>setActiveSearch('divisionname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('divisionname','');}} onSearchChange={v=>setColumnSearch('divisionname',v)}>{t('division', lang)}</SortableTh>
                <SortableTh col="curriculumname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['curriculumname']} isSearchOpen={activeSearch==='curriculumname'} onSearchOpen={()=>setActiveSearch('curriculumname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('curriculumname','');}} onSearchChange={v=>setColumnSearch('curriculumname',v)}>{t('curriculum', lang)}</SortableTh>
                <SortableTh col="studentCount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4">{t('studentsBadge', lang)}</SortableTh>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('actions', lang)}</th>
              </tr></thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {showAddRow && (
                <tr className="bg-blue-50/50 align-top">
                  <td className="px-4 py-3 text-center min-w-[220px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('class', lang)} <span className="text-red-500">*</span></label><select required className="input-field h-9" value={classForm.classid} onChange={(e) => setClassForm((p) => ({ ...p, classid: e.target.value }))}><option value="">{t('selectClass', lang)}</option>{classes.map((c) => <option key={c.classid} value={c.classid}>{lang === 'ar' ? (c.classname || c.classid) : (c.classname_en || c.classname || c.classid)}</option>)}</select></td>
                  <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('section', lang)} <span className="text-red-500">*</span></label><select required className="input-field h-9" value={classForm.sectionid} onChange={(e) => setClassForm((p) => ({ ...p, sectionid: e.target.value }))}><option value="">{t('selectSection', lang)}</option>{sections.map((section) => <option key={section.sectionid} value={section.sectionid}>{getField(section, 'sectionname', 'sectionname_en', lang)}</option>)}</select></td>
                  <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('stage', lang)} <span className="text-red-500">*</span></label><select required className="input-field h-9" value={classForm.stageid} onChange={(e) => setClassForm((p) => ({ ...p, stageid: e.target.value }))}><option value="">{t('selectStage', lang)}</option>{stages.map((stage) => <option key={stage.stageid} value={stage.stageid}>{getField(stage, 'stagename', 'stagename_en', lang)}</option>)}</select></td>
                  <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('division', lang)} <span className="text-red-500">*</span></label><select required className="input-field h-9" value={classForm.divisionid} onChange={(e) => setClassForm((p) => ({ ...p, divisionid: e.target.value }))}><option value="">{t('selectDivision', lang) || 'Select division'}</option>{divisions.map((division) => <option key={division.divisionid} value={division.divisionid}>{getField(division, 'divisionname', 'divisionname_en', lang)}</option>)}</select></td>
                  <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('curriculum', lang)} <span className="text-red-500">*</span></label><select required className="input-field h-9" value={classForm.curriculumid} onChange={(e) => setClassForm((p) => ({ ...p, curriculumid: e.target.value }))}><option value="">{t('selectCurriculum', lang) || 'Select curriculum'}</option>{curriculums.map((curriculum) => <option key={curriculum.curriculumid} value={curriculum.curriculumid}>{getField(curriculum, 'curriculumname', 'curriculumname_en', lang)}</option>)}</select></td>
                  <td className="px-4 py-3 text-center text-sm text-[#94a3b8]">—</td>
                  <td className="px-4 py-3 text-center"><div className="flex gap-2"><button onClick={handleCreate} disabled={!isClassFormValid || isLoading} className="px-3 py-2 rounded-lg bg-[#1d4ed8] text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed">{t('save', lang)}</button><button onClick={() => { setShowAddRow(false); setClassForm(EMPTY_CLASS); }} className="px-3 py-2 rounded-lg border text-xs font-bold">{t('cancel', lang)}</button></div></td>
                </tr>
              )}
              {!hasApplied ? (
                <tr><td colSpan={7} className="px-6 py-16 text-center text-[#94a3b8] font-medium">{t('pressApplyToLoad', lang)}</td></tr>
              ) : loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-[#94a3b8]"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-[#94a3b8]">{t('noData', lang)}</td></tr>
              ) : filtered.map((row) => (
                selectedRow && selectedRow.classid === row.classid && selectedRow.sectionid === row.sectionid && selectedRow.stageid === row.stageid ? (
                  <tr key={`${row.classid}-${row.sectionid}-${row.stageid}`} className="bg-amber-50/50 align-top">
                    <td className="px-4 py-3 text-center min-w-[220px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('class', lang)} <span className="text-red-500">*</span></label><select className="input-field h-9" value={editForm.classid} onChange={(e) => setEditForm((p) => ({ ...p, classid: e.target.value }))}>{classes.map((c) => <option key={c.classid} value={c.classid}>{lang === 'ar' ? (c.classname || c.classid) : (c.classname_en || c.classname || c.classid)}</option>)}</select></td>
                    <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('section', lang)} <span className="text-red-500">*</span></label><select className="input-field h-9" value={editForm.sectionid} onChange={(e) => setEditForm((p) => ({ ...p, sectionid: e.target.value }))}>{sections.map((section) => <option key={section.sectionid} value={section.sectionid}>{getField(section, 'sectionname', 'sectionname_en', lang)}</option>)}</select></td>
                    <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('stage', lang)} <span className="text-red-500">*</span></label><select className="input-field h-9" value={editForm.stageid} onChange={(e) => setEditForm((p) => ({ ...p, stageid: e.target.value }))}>{stages.map((stage) => <option key={stage.stageid} value={stage.stageid}>{getField(stage, 'stagename', 'stagename_en', lang)}</option>)}</select></td>
                    <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('division', lang)} <span className="text-red-500">*</span></label><select className="input-field h-9" value={editForm.divisionid} onChange={(e) => setEditForm((p) => ({ ...p, divisionid: e.target.value }))}>{divisions.map((division) => <option key={division.divisionid} value={division.divisionid}>{getField(division, 'divisionname', 'divisionname_en', lang)}</option>)}</select></td>
                    <td className="px-4 py-3 text-center min-w-[170px]"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('curriculum', lang)} <span className="text-red-500">*</span></label><select className="input-field h-9" value={editForm.curriculumid} onChange={(e) => setEditForm((p) => ({ ...p, curriculumid: e.target.value }))}>{curriculums.map((curriculum) => <option key={curriculum.curriculumid} value={curriculum.curriculumid}>{getField(curriculum, 'curriculumname', 'curriculumname_en', lang)}</option>)}</select></td>
                    <td className="px-4 py-3 text-center text-sm">{row.studentCount}</td>
                    <td className="px-4 py-3 text-center"><div className="flex gap-2"><button onClick={handleUpdate} className="px-3 py-2 rounded-lg bg-[#1d4ed8] text-white text-xs font-bold">{t('save', lang)}</button><button onClick={() => setSelectedRow(null)} className="px-3 py-2 rounded-lg border text-xs font-bold">{t('cancel', lang)}</button></div></td>
                  </tr>
                ) : (
                  <tr key={`${row.classid}-${row.sectionid}-${row.stageid}`} className="hover:bg-[#f8fafc]">
                    <td className="px-4 py-3 text-center text-sm font-semibold">{row.classDisplay}</td>
                    <td className="px-4 py-3 text-center text-sm">{row.sectionname}</td>
                    <td className="px-4 py-3 text-center text-sm">{row.stagename}</td>
                    <td className="px-4 py-3 text-center text-sm">{row.divisionname}</td>
                    <td className="px-4 py-3 text-center text-sm">{row.curriculumname}</td>
                    <td className="px-4 py-3 text-center text-sm">{row.studentCount}</td>
                    <td className="px-4 py-3 text-center"><div className="flex items-center gap-2"><button onClick={() => openEdit(row)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-50"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(row)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-red-50"><Trash2 className="h-4 w-4" /></button></div></td>
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