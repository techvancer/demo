import { getErrorMessage } from '../../lib/langHelper';
import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Edit2, Trash2, Loader2, Upload, Download, X } from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb';
import FilterBar from '../../components/FilterBar';
import { useFilterData } from '../../lib/useFilterData';
import { buildFilters, EMPTY_FILTER } from '../../lib/helpers';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, update, remove, nextId, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';
import { readCsvFile, pick, asInt } from '../../lib/adminCsv';
import { downloadTemplate } from '../../lib/csvTemplate';
import { useSortable } from '../../lib/useSortable';
import { useColumnSearch } from '../../lib/useColumnSearch';
import SortableTh from '../../components/SortableTh';

const EMPTY_FORM = {
  studentfirstname_ar: '', studentfirstname_en: '',
  studentfathersname_ar: '', studentfathersname_en: '',
  studentgrandfathersname_ar: '', studentgrandfathersname_en: '',
  studentsurname_ar: '', studentsurname_en: '',
  studentemail: '', studentmobile: '',
  parentname_ar: '', parentname_en: '',
  parentemail: '', parentmobile: '', parent_position: '',
  classid: '', sectionid: '', stageid: '', divisionid: '', curriculumid: '',
};
const sanitizePhone = (value = '') => String(value).replace(/\D/g, '').slice(0, 10);
const isTenDigitPhone = (value = '') => /^\d{10}$/.test(String(value || '').trim());

export default function AdminStudents() {
    const { lang, isAr } = useLang();

  const { addToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRunFromState = useRef(false);
  const filterData = useFilterData(user, lang);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [stages, setStages] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [curriculums, setCurriculums] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ classid: 'All', sectionid: 'All', stageid: 'All', divisionid: 'All', curriculumid: 'All' });
  const [showAddRow, setShowAddRow] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const { sorted: sortedStudents, sortCol, sortDir, handleSort } = useSortable(students, 'studentid');
  const { columnSearch, activeSearch, setActiveSearch, setColumnSearch, applyColumnSearch } = useColumnSearch();

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [stuList, stuScRows, clTbl, secRows, stgRows, divRows, curRows] = await Promise.all([
        rest('students_tbl', { select: '*' }),
        rest('students_sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
        rest('classes_tbl', { select: '*' }),
        rest('sections_tbl', { select: '*' }),
        rest('stages_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
        rest('divisions_tbl', { select: '*' }).catch(() => []),
        rest('curriculums_tbl', { select: '*' }).catch(() => []),
      ]);
      const merged = stuList.map((s) => {
        const sc = stuScRows.find((x) => x.studentid === s.studentid);
        if (!sc) return null;
        const cl = clTbl.find((c) => c.classid === sc.classid);
        const sec = secRows.find((x) => x.sectionid === sc.sectionid);
        const stg = stgRows.find((x) => x.stageid === sc.stageid);
        const div = divRows.find((x) => x.divisionid === sc.divisionid);
        const cur = curRows.find((x) => x.curriculumid === sc.curriculumid);
        return {
          ...s,
          classid: sc.classid,
          sectionid: sc.sectionid,
          stageid: sc.stageid,
          curriculumid: sc.curriculumid,
          divisionid: sc.divisionid,
          classname: getField(cl, 'classname', 'classname_en', lang) || cl?.classname || '?',
          sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || '?',
          fullName: _getStudentName(s, lang) || '—',
          stageName: getField(stg, 'stagename', 'stagename_en', lang) || '—',
          stagename: getField(stg, 'stagename', 'stagename_en', lang) || '—',
          divisionname: getField(div, 'divisionname', 'divisionname_en', lang) || div?.divisionname || sc.divisionid || '—',
          curriculumname: getField(cur, 'curriculumname', 'curriculumname_en', lang) || cur?.curriculumname || sc.curriculumid || '—',
        };
      }).filter(Boolean);
      setStudents(merged);
      setClasses(clTbl);
      setSections(secRows);
      setStages([...new Map(stgRows.map((s) => [s.stageid, s])).values()]);
      setDivisions(divRows);
      setCurriculums(curRows);
    } catch (e) {
      addToast(getErrorMessage(e, 'general'), 'error');
    } finally {
      setLoading(false);
    }
  }, [user, addToast, lang]);

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



  const filtered = applyColumnSearch(sortedStudents.filter((s) => {
    const q = search.toLowerCase();
    const stuFullName = _getStudentName(s, lang) || ''; const ms = !search || stuFullName.toLowerCase().includes(q) || _getStudentName(s, lang)?.toLowerCase().includes(q) || String(s.studentid).includes(q);
    const mc = applied.classid === 'All' || String(s.classid) === applied.classid;
    const msec = applied.sectionid === 'All' || String(s.sectionid) === applied.sectionid;
    const mst = applied.stageid === 'All' || String(s.stageid) === applied.stageid;
    const md = applied.divisionid === 'All' || String(s.divisionid) === applied.divisionid;
    const mcur = applied.curriculumid === 'All' || String(s.curriculumid) === applied.curriculumid;
    return ms && mc && msec && mst && md && mcur;
  }));

  async function createStudent(payload) {
    const newStudentId = await nextId('students_tbl', 'studentid');
    const fullNameEn = [payload.studentfirstname_en, payload.studentfathersname_en, payload.studentsurname_en].filter(Boolean).join(' ') || _getStudentName(payload, lang) || '';
    const [newStu] = await insert('students_tbl', {
      studentid: newStudentId,
      studentfirstname_ar: payload.studentfirstname_ar || null,
      studentfirstname_en: payload.studentfirstname_en || null,
      studentfathersname_ar: payload.studentfathersname_ar || null,
      studentfathersname_en: payload.studentfathersname_en || null,
      studentgrandfathersname_ar: payload.studentgrandfathersname_ar || null,
      studentgrandfathersname_en: payload.studentgrandfathersname_en || null,
      studentsurname_ar: payload.studentsurname_ar || null,
      studentsurname_en: payload.studentsurname_en || null,
      studentemail: payload.studentemail || null,
      studentmobile: payload.studentmobile || null,
      parentname: getField(payload, 'parentname_ar', 'parentname_en', lang) || payload.parentname || null,
      parentname_ar: payload.parentname_ar || null,
      parentname_en: getField(payload, 'parentname_ar', 'parentname_en', lang) || null,
      parentemail: payload.parentemail || null,
      parentmobile: payload.parentmobile || null,
      parent_position: payload.parent_position || null,
    });
    await insert('students_sections_classes_tbl', {
      studentid: newStu.studentid,
      classid: Number.parseInt(payload.classid, 10),
      sectionid: Number.parseInt(payload.sectionid, 10),
      stageid: Number.parseInt(payload.stageid, 10),
      schoolid: user.schoolid,
      branchid: user.branchid,
      divisionid: Number.parseInt(payload.divisionid || user.divisionid || 1, 10),
      curriculumid: Number.parseInt(payload.curriculumid || user.curriculumid || 1, 10),
    });
  }

  const handleCreate = async () => {
    if ((!formData.studentfirstname_en && !formData.studentfirstname_ar) || !formData.classid || !formData.sectionid || !formData.stageid) {
      addToast(t('studentNameClassReq', lang), 'warning');
      return;
    }
    if ((formData.studentmobile && !isTenDigitPhone(formData.studentmobile)) || (formData.parentmobile && !isTenDigitPhone(formData.parentmobile))) {
      addToast('Phone numbers must be exactly 10 digits.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await createStudent(formData);
      addToast(t('studentEnrolled', lang), 'success');
      setShowAddRow(false);
      setFormData(EMPTY_FORM);
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
      const rows = await readCsvFile(file);
      for (const row of rows) {
        const payload = {
                    studentemail: pick(row, ['studentemail', 'email']),
          studentmobile: pick(row, ['studentmobile', 'mobile']),
          parentname: pick(row, ['parentname', 'parent']),
          parentemail: pick(row, ['parentemail']),
          parentmobile: pick(row, ['parentmobile']),
          parent_position: pick(row, ['parent_position', 'parentposition']),
          classid: pick(row, ['classid']),
          sectionid: pick(row, ['sectionid']),
          stageid: pick(row, ['stageid']),
          divisionid: pick(row, ['divisionid'], String(user.divisionid || 1)),
          curriculumid: pick(row, ['curriculumid'], String(user.curriculumid || 1)),
        };
        if ((payload.studentmobile && !isTenDigitPhone(payload.studentmobile)) || (payload.parentmobile && !isTenDigitPhone(payload.parentmobile))) {
          throw new Error('Phone numbers in CSV must be exactly 10 digits.');
        }
        if (_getStudentName(payload, lang) && payload.classid && payload.sectionid && payload.stageid) await createStudent(payload);
      }
      addToast(t('studentsCsvUploaded', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(getErrorMessage(err, 'general'), 'error');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };
;
;

  const handleDelete = async (student) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${student.studentid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
      await remove('students_tbl', student.studentid, 'studentid');
      addToast(t('deleteSuccess', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(getErrorMessage(err, 'general'), 'error');
    }
  };

  const divisionOptions = [{ value: 'All', label: t('allDivisions', lang) }, ...divisions.map((d) => ({ value: String(d.divisionid), label: getField(d, 'divisionname', 'divisionname_en', lang) || d.divisionname || `Division ${d.divisionid}` }))];
  const curriculumOptions = [{ value: 'All', label: t('allCurriculums', lang) }, ...curriculums.map((c) => ({ value: String(c.curriculumid), label: getField(c, 'curriculumname', 'curriculumname_en', lang) || c.curriculumname || `Curriculum ${c.curriculumid}` }))];


    useEffect(() => {
        if (!hasApplied) return;
        fetchData();
    }, [lang, hasApplied, fetchData]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('students', lang)}</h1>
          <p className="text-[#64748b] text-sm">{t('manageStudentsDesc', lang)}</p>
          <Breadcrumb />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => downloadTemplate('student_upload').catch((err) => addToast(getErrorMessage(err, 'general'), 'error'))} className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2">
            <Download className="h-4 w-4" /> {t('downloadTemplate', lang)}
          </button>
          <label className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" /> {t('uploadCsv', lang)}
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
          <button onClick={() => navigate('/admin/students/enroll')} className="btn-primary flex items-center gap-2 h-11 px-6 !bg-[#4f46e5] hover:!bg-[#4338ca]">
            <Plus className="h-5 w-5" /> {t('enrollStudent', lang)}
          </button>
        </div>
      </div>

      <FilterBar
        filters={buildFilters(applied, filterData, {}, lang).filter(f => f.key !== 'examid' && f.key !== 'semisterid')}
        appliedFilters={applied}

        onApply={(vals) => { setApplied(vals); setHasApplied(true); fetchData(); }}
        onReset={(vals) => { setApplied(vals); setHasApplied(false); setStudents([]); }}
      />
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
          <input type="text" placeholder={t('searchStudentsAdminPlaceholder', lang)} className="input-field pl-10 h-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card bg-white overflow-hidden rounded-xl border border-[#e2e8f0]">
        <div className="overflow-x-auto" dir={isAr ? 'rtl' : 'ltr'}>
          <table className={`w-full ${isAr ? 'text-right' : 'text-left'}`}>
            <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <tr>
                <SortableTh col="studentid" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['studentid']} isSearchOpen={activeSearch==='studentid'} onSearchOpen={()=>setActiveSearch('studentid')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('studentid','');}} onSearchChange={v=>setColumnSearch('studentid',v)}>{t('id', lang)}</SortableTh>
                <SortableTh col="fullName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['fullName']} isSearchOpen={activeSearch==='fullName'} onSearchOpen={()=>setActiveSearch('fullName')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('fullName','');}} onSearchChange={v=>setColumnSearch('fullName',v)}>{t('name', lang)}</SortableTh>
                <SortableTh col="classname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['classname']} isSearchOpen={activeSearch==='classname'} onSearchOpen={()=>setActiveSearch('classname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('classname','');}} onSearchChange={v=>setColumnSearch('classname',v)}>{t('class', lang)}</SortableTh>
                <SortableTh col="sectionname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['sectionname']} isSearchOpen={activeSearch==='sectionname'} onSearchOpen={()=>setActiveSearch('sectionname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('sectionname','');}} onSearchChange={v=>setColumnSearch('sectionname',v)}>{t('section', lang)}</SortableTh>
                <SortableTh col="stagename" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['stagename']} isSearchOpen={activeSearch==='stagename'} onSearchOpen={()=>setActiveSearch('stagename')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('stagename','');}} onSearchChange={v=>setColumnSearch('stagename',v)}>{t('stage', lang)}</SortableTh>
                <SortableTh col="divisionname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['divisionname']} isSearchOpen={activeSearch==='divisionname'} onSearchOpen={()=>setActiveSearch('divisionname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('divisionname','');}} onSearchChange={v=>setColumnSearch('divisionname',v)}>{t('division', lang)}</SortableTh>
                <SortableTh col="curriculumname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['curriculumname']} isSearchOpen={activeSearch==='curriculumname'} onSearchOpen={()=>setActiveSearch('curriculumname')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('curriculumname','');}} onSearchChange={v=>setColumnSearch('curriculumname',v)}>{t('curriculum', lang)}</SortableTh>
                <SortableTh col="studentemail" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['studentemail']} isSearchOpen={activeSearch==='studentemail'} onSearchOpen={()=>setActiveSearch('studentemail')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('studentemail','');}} onSearchChange={v=>setColumnSearch('studentemail',v)}>{t('email', lang)}</SortableTh>
                <SortableTh col="studentmobile" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="px-4" searchValue={columnSearch['studentmobile']} isSearchOpen={activeSearch==='studentmobile'} onSearchOpen={()=>setActiveSearch('studentmobile')} onSearchClose={()=>{setActiveSearch(null);setColumnSearch('studentmobile','');}} onSearchChange={v=>setColumnSearch('studentmobile',v)}>{t('mobile', lang)}</SortableTh>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">{t('actions', lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {!hasApplied ? (
                <tr><td colSpan={10} className="px-6 py-16 text-center text-[#94a3b8] font-medium">{t('pressApplyToLoad', lang)}</td></tr>
              ) : loading ? (

                <tr><td colSpan={10} className="px-6 py-12 text-center text-[#94a3b8]"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-[#94a3b8]">{t('noData', lang)}</td></tr>
              ) : filtered.map((s) => (
(
                  <tr key={s.studentid} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-3 text-center"><span className="text-xs font-mono font-bold text-[#94a3b8] bg-slate-100 px-2 py-1 rounded">#{s.studentid}</span></td>
                    <td className="px-4 py-3 text-center"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-[10px] uppercase">{(getField(s, 'studentfirstname_ar', 'studentfirstname_en', lang) || '').charAt(0)}</div><p className="text-sm font-bold text-[#0f172a]">{_getStudentName(s, lang)}</p></div></td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-[#0f172a]">{t('class', lang)} {s.classname}</td>
                    <td className="px-4 py-3 text-center"><span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-xs font-bold border border-blue-100 min-w-[28px]">{s.sectionname}</span></td>
                    <td className="px-4 py-3 text-center text-xs text-[#64748b] font-medium whitespace-nowrap">{s.stageName}</td>
                    <td className="px-4 py-3 text-center text-xs text-[#475569]">{s.divisionname}</td>
                    <td className="px-4 py-3 text-center text-xs text-[#475569]">{s.curriculumname}</td>
                    <td className="px-4 py-3 text-center text-sm text-[#475569]">{s.studentemail || '—'}</td>
                    <td className="px-4 py-3 text-center text-sm text-[#475569]">{s.studentmobile || '—'}</td>
                    <td className="px-4 py-3 text-center"><div className="flex items-center gap-2"><button onClick={() => navigate(`/admin/students/edit/${s.studentid}`, { state: { student: s } })} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-50"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(s)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-red-50"><Trash2 className="h-4 w-4" /></button></div></td>
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
