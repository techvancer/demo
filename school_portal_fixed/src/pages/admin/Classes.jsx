import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Loader2, Search, Upload, Download } from 'lucide-react';
import FilterBar from '../../components/FilterBar';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';
import { useFilterData } from '../../lib/useFilterData';
import { buildFilters, EMPTY_FILTER } from '../../lib/helpers';
import { readCsvFile, pick } from '../../lib/adminCsv';

const EMPTY_CLASS = { classname: '', sectionid: '', stageid: '', divisionid: '', curriculumid: '' };

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
  const [loading, setLoading] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ classid: 'All', sectionid: 'All', stageid: 'All', curriculumid: 'All', divisionid: 'All' });
  const [showAddRow, setShowAddRow] = useState(false);
  const [classForm, setClassForm] = useState(EMPTY_CLASS);
  const [isLoading, setIsLoading] = useState(false);

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
        const studentCount = stuScRows.filter((row) => row.classid === sc.classid && row.sectionid === sc.sectionid).length;
        const div = (divRows || []).find(d => d.divisionid === sc.divisionid);
        const cur = (curRows || []).find(cv => cv.curriculumid === sc.curriculumid);
        return { ...sc, classname: getField(cl, 'classname', 'classname_en', lang) || cl?.classname || sc.classid, sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || sc.sectionid, stageName: getField(stage, 'stagename', 'stagename_en', lang) || '—', studentCount, divisionname: getField(div, 'divisionname', 'divisionname_en', lang) || div?.divisionname || '—', curriculumname: getField(cur, 'curriculumname', 'curriculumname_en', lang) || cur?.curriculumname || '—' };
      });
      setRows(merged);
      setClasses(classRows);
      setSections(secRows);
      setStages([...new Map(stageRows.map(s => [s.stageid, s])).values()]);
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  // Read URL params from dashboard card click and auto-apply
  useEffect(() => {
    if (!user || hasRunFromState.current) return;
    hasRunFromState.current = true;
    const keys = ['curriculumid', 'divisionid', 'stageid', 'classid', 'sectionid'];
    const fromUrl = {};
    const state = location.state || {};
    keys.forEach(k => { if (state[k]) fromUrl[k] = state[k]; });
    const merged = Object.keys(fromUrl).length > 0 ? { ...applied, ...fromUrl } : applied;
    if (Object.keys(fromUrl).length > 0) setApplied(merged);
    setHasApplied(true);
    fetchData();
  }, [fetchData, user]);

  const filtered = rows.filter((row) => {
    const ms = !search || `${t('class', lang)} ${row.classname}`.toLowerCase().includes(search.toLowerCase()) || String(row.sectionname).toLowerCase().includes(search.toLowerCase());
    const mc   = applied.classid      === 'All' || String(row.classid)      === applied.classid;
    const msec = applied.sectionid    === 'All' || String(row.sectionid)    === applied.sectionid;
    const mst  = applied.stageid      === 'All' || String(row.stageid)      === applied.stageid;
    const mdiv = applied.divisionid   === 'All' || String(row.divisionid)   === applied.divisionid;
    const mcur = applied.curriculumid === 'All' || String(row.curriculumid) === applied.curriculumid;
    return ms && mc && msec && mst && mdiv && mcur;
  });

  async function createClassRow(payload) {
    const [newClass] = await insert('classes_tbl', { classname: payload.classname });
    const classid = newClass.classid;
    const stageid = Number.parseInt(payload.stageid, 10);
    const sectionid = Number.parseInt(payload.sectionid, 10);
    const divisionid = Number.parseInt(payload.divisionid || user.divisionid || 1, 10);
    const curriculumid = Number.parseInt(payload.curriculumid || user.curriculumid || 1, 10);
    await insert('classes_stages_tbl', { classid, stageid, curriculumid, divisionid, branchid: user.branchid, schoolid: user.schoolid });
    await insert('sections_classes_tbl', { classid, sectionid, stageid, branchid: user.branchid, schoolid: user.schoolid, divisionid, curriculumid });
  }

  const handleCreate = async () => {
    if (!classForm.classname || !classForm.sectionid || !classForm.stageid) {
      addToast(t('classNameReq', lang), 'warning');
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
      const csvRows = await readCsvFile(file);
      for (const row of csvRows) {
        const payload = {
          classname: pick(row, ['classname', 'grade', 'class']),
          sectionid: pick(row, ['sectionid']),
          stageid: pick(row, ['stageid']),
          divisionid: pick(row, ['divisionid'], String(user.divisionid || 1)),
          curriculumid: pick(row, ['curriculumid'], String(user.curriculumid || 1)),
        };
        if (payload.classname && payload.sectionid && payload.stageid) await createClassRow(payload);
      }
      addToast(t('classesCsvUploaded', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
      event.target.value = '';
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
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('classes', lang)}</h1>
          <p className="text-[#64748b] text-sm">{t('allGradesInBranch', lang)}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => {
              const headers = ['classname','sectionname','stagename','divisionname','curriculumname'];
              const sample  = [t('className', lang),'A',t('stage', lang),t('division', lang),t('curriculum', lang)];
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
          <button onClick={() => setShowAddRow(true)} className="btn-primary flex items-center gap-2 h-11 px-6"><Plus className="h-5 w-5" /> {t('newClass', lang)}</button>
        </div>
      </div>

      <FilterBar
        filters={buildFilters(applied, filterData, {}, lang).filter(f => ['curriculumid','divisionid','stageid','classid','sectionid'].includes(f.key))}
        onApply={(vals) => { setApplied(vals); setHasApplied(true); fetchData(); }}
        onReset={(vals) => { setApplied({ classid: 'All', sectionid: 'All', stageid: 'All', curriculumid: 'All', divisionid: 'All' }); setHasApplied(false); setRows([]); }}
      />

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
          <input type="text" placeholder={t('searchClassesPlaceholder', lang)} className="input-field pl-10 h-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-white overflow-hidden rounded-xl border border-[#e2e8f0]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]"><tr>{[t('classes', lang), t('section', lang), t('stage', lang), t('studentsBadge', lang), t('actions', lang)].map((h) => <th key={h} className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {showAddRow && (
                <tr className="bg-blue-50/50">
                  <td className="px-4 py-3"><input className="input-field h-9" placeholder={t('className', lang)} value={classForm.classname} onChange={(e) => setClassForm((p) => ({ ...p, classname: e.target.value }))} /></td>
                  <td className="px-4 py-3"><select className="input-field h-9" value={classForm.sectionid} onChange={(e) => setClassForm((p) => ({ ...p, sectionid: e.target.value }))}><option value="">{t('selectSection', lang)}</option>{sections.map((section) => <option key={section.sectionid} value={section.sectionid}>{getField(section, 'sectionname', 'sectionname_en', lang) || section.sectionname}</option>)}</select></td>
                  <td className="px-4 py-3"><select className="input-field h-9" value={classForm.stageid} onChange={(e) => setClassForm((p) => ({ ...p, stageid: e.target.value }))}><option value="">{t('selectStage', lang)}</option>{stages.map((stage) => <option key={stage.stageid} value={stage.stageid}>{getField(stage, 'stagename', 'stagename_en', lang)}</option>)}</select></td>
                  <td className="px-4 py-3 text-sm text-[#94a3b8]">—</td>
                  <td className="px-4 py-3"><div className="flex gap-2"><button onClick={handleCreate} className="px-3 py-2 rounded-lg bg-[#1d4ed8] text-white text-xs font-bold">{t('save', lang)}</button><button onClick={() => { setShowAddRow(false); setClassForm(EMPTY_CLASS); }} className="px-3 py-2 rounded-lg border text-xs font-bold">{t('cancel', lang)}</button></div></td>
                </tr>
              )}
              {!hasApplied ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center text-[#94a3b8] font-medium">{t('pressApplyToLoad', lang)}</td></tr>
              ) : loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#94a3b8]"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#94a3b8]">{t('noData', lang)}</td></tr>
              ) : filtered.map((row) => (
                <tr key={`${row.classid}-${row.sectionid}`} className="hover:bg-[#f8fafc]">
                  <td className="px-4 py-4 text-sm font-semibold">{t('class', lang)} {row.classname}</td>
                  <td className="px-4 py-4 text-sm">{row.sectionname}</td>
                  <td className="px-4 py-4 text-sm">{row.stageName}</td>
                  <td className="px-4 py-4 text-sm">{row.studentCount}</td>
                  <td className="px-4 py-4"><button onClick={() => handleDelete(row)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-red-50"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {isLoading && <div className="text-sm text-[#64748b]">{t('savingChanges', lang)}...</div>}
    </div>
  );
}
