import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Edit2, Trash2, Loader2, Upload, Download, X } from 'lucide-react';
import FilterBar from '../../components/FilterBar';
import { useFilterData } from '../../lib/useFilterData';
import { buildFilters, EMPTY_FILTER } from '../../lib/helpers';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, update, remove, nextId, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';
import { readCsvFile, pick, asInt } from '../../lib/adminCsv';
import { downloadTemplate } from '../../lib/csvTemplate';

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
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editData, setEditData] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);

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
          stageName: getField(stg, 'stagename', 'stagename_en', lang) || '—',
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



  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    const stuFullName = _getStudentName(s, lang) || ''; const ms = !search || stuFullName.toLowerCase().includes(q) || _getStudentName(s, lang)?.toLowerCase().includes(q) || String(s.studentid).includes(q);
    const mc = applied.classid === 'All' || String(s.classid) === applied.classid;
    const msec = applied.sectionid === 'All' || String(s.sectionid) === applied.sectionid;
    const mst = applied.stageid === 'All' || String(s.stageid) === applied.stageid;
    const md = applied.divisionid === 'All' || String(s.divisionid) === applied.divisionid;
    const mcur = applied.curriculumid === 'All' || String(s.curriculumid) === applied.curriculumid;
    return ms && mc && msec && mst && md && mcur;
  });

  async function createStudent(payload) {
    const newStudentId = await nextId('students_tbl', 'studentid');
    const fullNameEn = [payload.studentfirstname_en, payload.studentfathersname_en, payload.studentsurname_en].filter(Boolean).join(' ') || _getStudentName(payload, lang) || '';
    const [newStu] = await insert('students_tbl', {
      studentid: newStudentId,
      studentname: [payload.studentfirstname_ar, payload.studentfathersname_ar, payload.studentsurname_ar].filter(Boolean).join(' ') || _getStudentName(payload, lang) || fullNameEn,
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
    setIsLoading(true);
    try {
      await createStudent(formData);
      addToast(t('studentEnrolled', lang), 'success');
      setShowAddRow(false);
      setFormData(EMPTY_FORM);
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
          studentname: pick(row, ['studentname', 'name']),
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
        if (_getStudentName(payload, lang) && payload.classid && payload.sectionid && payload.stageid) await createStudent(payload);
      }
      addToast(t('studentsCsvUploaded', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const openEdit = (student) => {
    setSelectedStudent(student);
    setEditData({
      studentfirstname_ar: student.studentfirstname_ar || '',
      studentfirstname_en: student.studentfirstname_en || '',
      studentfathersname_ar: student.studentfathersname_ar || '',
      studentfathersname_en: student.studentfathersname_en || '',
      studentgrandfathersname_ar: student.studentgrandfathersname_ar || '',
      studentgrandfathersname_en: student.studentgrandfathersname_en || '',
      studentsurname_ar: student.studentsurname_ar || '',
      studentsurname_en: student.studentsurname_en || '',
      studentemail: student.studentemail || '',
      studentmobile: student.studentmobile || '',
      parentname_ar: student.parentname_ar || student.parentname || '',
      parentname_en: getField(student, 'parentname_ar', 'parentname_en', lang) || student.parentname || '',
      parentemail: student.parentemail || '',
      parentmobile: student.parentmobile || '',
      parent_position: student.parent_position || '',
      classid: String(student.classid || ''),
      sectionid: String(student.sectionid || ''),
      stageid: String(student.stageid || ''),
      divisionid: String(student.divisionid || ''),
      curriculumid: String(student.curriculumid || ''),
    });
  };

  const handleUpdate = async () => {
    if (!selectedStudent) return;
    setIsLoading(true);
    try {
      await update('students_tbl', selectedStudent.studentid, 'studentid', {
        studentname: [editData.studentfirstname_ar, editData.studentfathersname_ar, editData.studentsurname_ar].filter(Boolean).join(' ') || _getStudentName(selectedStudent, lang),
        studentfirstname_ar: editData.studentfirstname_ar || null,
        studentfirstname_en: editData.studentfirstname_en || null,
        studentfathersname_ar: editData.studentfathersname_ar || null,
        studentfathersname_en: editData.studentfathersname_en || null,
        studentgrandfathersname_ar: editData.studentgrandfathersname_ar || null,
        studentgrandfathersname_en: editData.studentgrandfathersname_en || null,
        studentsurname_ar: editData.studentsurname_ar || null,
        studentsurname_en: editData.studentsurname_en || null,
        studentemail: editData.studentemail || null,
        studentmobile: editData.studentmobile || null,
        parentname: getField(editData, 'parentname_ar', 'parentname_en', lang) || editData.parentname_ar || null,
        parentname_ar: editData.parentname_ar || null,
        parentname_en: getField(editData, 'parentname_ar', 'parentname_en', lang) || null,
        parentemail: editData.parentemail || null,
        parentmobile: editData.parentmobile || null,
        parent_position: editData.parent_position || null,
      });
      await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${selectedStudent.studentid}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classid: Number.parseInt(editData.classid, 10),
          sectionid: Number.parseInt(editData.sectionid, 10),
          stageid: Number.parseInt(editData.stageid, 10),
          divisionid: Number.parseInt(editData.divisionid || user.divisionid || 1, 10),
          curriculumid: Number.parseInt(editData.curriculumid || user.curriculumid || 1, 10),
        }),
      });
      addToast(t('updateSuccess', lang), 'success');
      setSelectedStudent(null);
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (student) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${student.studentid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
      await remove('students_tbl', student.studentid, 'studentid');
      addToast(t('deleteSuccess', lang), 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const divisionOptions = [{ value: 'All', label: t('allDivisions', lang) }, ...divisions.map((d) => ({ value: String(d.divisionid), label: getField(d, 'divisionname', 'divisionname_en', lang) || d.divisionname || `Division ${d.divisionid}` }))];
  const curriculumOptions = [{ value: 'All', label: t('allCurriculums', lang) }, ...curriculums.map((c) => ({ value: String(c.curriculumid), label: getField(c, 'curriculumname', 'curriculumname_en', lang) || c.curriculumname || `Curriculum ${c.curriculumid}` }))];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('students', lang)}</h1>
          <p className="text-[#64748b] text-sm">{t('manageStudentsDesc', lang)}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => downloadTemplate('student_upload').catch((err) => addToast(err.message, 'error'))} className="h-11 px-4 border border-[#e2e8f0] rounded-xl bg-white font-semibold text-sm text-[#334155] flex items-center gap-2">
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
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <tr>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('id', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('name', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('class', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('section', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider">{t('stage', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">{t('division', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">{t('curriculum', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">{t('parent', lang)}</th>
                <th className="px-4 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">{t('mobile', lang)}</th>
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
                selectedStudent?.studentid === s.studentid ? (
                  <tr key={s.studentid} className="bg-amber-50/30">
                    <td className="px-4 py-3 text-xs font-mono font-bold text-[#94a3b8]">#{s.studentid}</td>
                    <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-[10px]">✏️</div><span className="text-sm font-bold text-[#0f172a]">{_getStudentName(s, lang)}</span></div></td>
                    <td className="px-4 py-4 text-sm font-medium text-[#0f172a]" colSpan={7}><span className="text-xs text-[#94a3b8]">{t('editingInSidePanel', lang)}</span></td>
                    <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => setSelectedStudent(null)} className="px-3 py-2 rounded-lg border text-xs font-bold">{t('cancel', lang)}</button></div></td>
                  </tr>
                ) : (
                  <tr key={s.studentid} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-4"><span className="text-xs font-mono font-bold text-[#94a3b8] bg-slate-100 px-2 py-1 rounded">#{s.studentid}</span></td>
                    <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-[10px] uppercase">{(getField(s, 'studentfirstname_ar', 'studentfirstname_en', lang) || '').charAt(0)}</div><p className="text-sm font-bold text-[#0f172a]">{_getStudentName(s, lang)}</p></div></td>
                    <td className="px-4 py-4 text-sm font-medium text-[#0f172a]">{t('class', lang)} {s.classname}</td>
                    <td className="px-4 py-4"><span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-xs font-bold border border-blue-100 min-w-[28px]">{s.sectionname}</span></td>
                    <td className="px-4 py-4 text-xs text-[#64748b] font-medium whitespace-nowrap">{s.stageName}</td>
                    <td className="px-4 py-4 text-xs text-[#475569]">{s.divisionname}</td>
                    <td className="px-4 py-4 text-xs text-[#475569]">{s.curriculumname}</td>
                    <td className="px-4 py-4 text-sm text-[#475569]">{s.parentname || '—'}</td>
                    <td className="px-4 py-4 text-sm text-[#475569]">{s.studentmobile || '—'}</td>
                    <td className="px-4 py-4"><div className="flex items-center gap-2"><button onClick={() => openEdit(s)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-50"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(s)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-red-50"><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isLoading && <div className="text-sm text-[#64748b]">{t('savingChanges', lang)}...</div>}
      {/* Edit Student slide-over */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-[60] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedStudent(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25 }} className="relative w-full max-w-2xl bg-white shadow-2xl h-full overflow-y-auto">
              <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between bg-[#f8fafc] sticky top-0 z-10">
                <h2 className="text-xl font-bold text-[#0f172a]">{t('editStudent', lang)} #{selectedStudent?.studentid}</h2>
                <button onClick={() => setSelectedStudent(null)} className="p-2 hover:bg-white rounded-full text-[#64748b]"><X className="h-6 w-6" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-black text-[#0f172a] uppercase tracking-wider mb-3 pb-1 border-b border-[#e2e8f0]">{t('studentNameFields', lang)}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('firstNameAr', lang)}</label><input className="input-field h-10 w-full" dir="rtl" value={editData.studentfirstname_ar || ''} onChange={e => setEditData(p => ({ ...p, studentfirstname_ar: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('firstNameEn', lang)}</label><input className="input-field h-10 w-full" value={editData.studentfirstname_en || ''} onChange={e => setEditData(p => ({ ...p, studentfirstname_en: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('fatherNameAr', lang)}</label><input className="input-field h-10 w-full" dir="rtl" value={editData.studentfathersname_ar || ''} onChange={e => setEditData(p => ({ ...p, studentfathersname_ar: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('fatherNameEn', lang)}</label><input className="input-field h-10 w-full" value={editData.studentfathersname_en || ''} onChange={e => setEditData(p => ({ ...p, studentfathersname_en: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('grandfatherNameAr', lang)}</label><input className="input-field h-10 w-full" dir="rtl" value={editData.studentgrandfathersname_ar || ''} onChange={e => setEditData(p => ({ ...p, studentgrandfathersname_ar: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('grandfatherNameEn', lang)}</label><input className="input-field h-10 w-full" value={editData.studentgrandfathersname_en || ''} onChange={e => setEditData(p => ({ ...p, studentgrandfathersname_en: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('surnameAr', lang)}</label><input className="input-field h-10 w-full" dir="rtl" value={editData.studentsurname_ar || ''} onChange={e => setEditData(p => ({ ...p, studentsurname_ar: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('surnameEn', lang)}</label><input className="input-field h-10 w-full" value={editData.studentsurname_en || ''} onChange={e => setEditData(p => ({ ...p, studentsurname_en: e.target.value }))} /></div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0f172a] uppercase tracking-wider mb-3 pb-1 border-b border-[#e2e8f0]">{t('studentContact', lang)}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('email', lang)}</label><input className="input-field h-10 w-full" type="email" value={editData.studentemail || ''} onChange={e => setEditData(p => ({ ...p, studentemail: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('mobile', lang)}</label><input className="input-field h-10 w-full" value={editData.studentmobile || ''} onChange={e => setEditData(p => ({ ...p, studentmobile: e.target.value }))} /></div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0f172a] uppercase tracking-wider mb-3 pb-1 border-b border-[#e2e8f0]">{t('parentGuardian', lang)}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('parentNameAr', lang)}</label><input className="input-field h-10 w-full" dir="rtl" value={editData.parentname_ar || ''} onChange={e => setEditData(p => ({ ...p, parentname_ar: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('parentNameEn', lang)}</label><input className="input-field h-10 w-full" value={getField(editData, 'parentname_ar', 'parentname_en', lang) || ''} onChange={e => setEditData(p => ({ ...p, parentname_en: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('parentEmail', lang)}</label><input className="input-field h-10 w-full" type="email" value={editData.parentemail || ''} onChange={e => setEditData(p => ({ ...p, parentemail: e.target.value }))} /></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('parentMobile', lang)}</label><input className="input-field h-10 w-full" value={editData.parentmobile || ''} onChange={e => setEditData(p => ({ ...p, parentmobile: e.target.value }))} /></div>
                    <div className="col-span-2"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('parentPosition', lang)}</label><input className="input-field h-10 w-full" value={editData.parent_position || ''} onChange={e => setEditData(p => ({ ...p, parent_position: e.target.value }))} /></div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0f172a] uppercase tracking-wider mb-3 pb-1 border-b border-[#e2e8f0]">{t('classAssignment', lang)}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('class', lang)}</label><select className="input-field h-10 w-full" value={editData.classid} onChange={e => setEditData(p => ({ ...p, classid: e.target.value }))}><option value="">{t('selectClass', lang)}</option>{classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname}</option>)}</select></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('section', lang)}</label><select className="input-field h-10 w-full" value={editData.sectionid} onChange={e => setEditData(p => ({ ...p, sectionid: e.target.value }))}><option value="">{t('selectSection', lang)}</option>{sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}</select></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('stage', lang)}</label><select className="input-field h-10 w-full" value={editData.stageid} onChange={e => setEditData(p => ({ ...p, stageid: e.target.value }))}><option value="">{t('selectStage', lang)}</option>{stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}</select></div>
                    <div><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('division', lang)}</label><select className="input-field h-10 w-full" value={editData.divisionid} onChange={e => setEditData(p => ({ ...p, divisionid: e.target.value }))}><option value="">{t('default', lang)}</option>{divisions.map(d => <option key={d.divisionid} value={d.divisionid}>{getField(d, 'divisionname', 'divisionname_en', lang) || d.divisionname}</option>)}</select></div>
                    <div className="col-span-2"><label className="text-xs font-bold text-[#64748b] mb-1 block">{t('curriculum', lang)}</label><select className="input-field h-10 w-full" value={editData.curriculumid} onChange={e => setEditData(p => ({ ...p, curriculumid: e.target.value }))}><option value="">{t('default', lang)}</option>{curriculums.map(c => <option key={c.curriculumid} value={c.curriculumid}>{getField(c, 'curriculumname', 'curriculumname_en', lang) || c.curriculumname}</option>)}</select></div>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-[#f8fafc] border-t border-[#e2e8f0] sticky bottom-0 flex justify-end gap-3">
                <button onClick={() => setSelectedStudent(null)} className="px-6 py-2.5 font-bold text-[#64748b]">{t('cancel', lang)}</button>
                <button onClick={handleUpdate} disabled={isLoading} className="btn-primary h-11 px-8 flex items-center gap-2">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('saveChanges', lang)}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
