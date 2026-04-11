import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, UserPlus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, nextId } from '../../lib/supabaseClient';

const EMPTY = {
  studentfirstname_ar: '', studentfirstname_en: '',
  studentfathersname_ar: '', studentfathersname_en: '',
  studentgrandfathersname_ar: '', studentgrandfathersname_en: '',
  studentsurname_ar: '', studentsurname_en: '',
  studentemail: '', studentmobile: '',
  parentname_ar: '', parentname_en: '',
  parentemail: '', parentmobile: '', parent_position: '',
  classid: '', sectionid: '', stageid: '', divisionid: '', curriculumid: '',
};

export default function AdminEnrollStudent() {
    const { lang, isAr } = useLang();

  const { addToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const [classes, setClasses]       = useState([]);
  const [sections, setSections]     = useState([]);
  const [stages, setStages]         = useState([]);
  const [divisions, setDivisions]   = useState([]);
  const [curriculums, setCurriculums] = useState([]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Load all dropdown data on mount — independent of student filter
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [clTbl, secRows, stgRows, divRows, curRows] = await Promise.all([
          rest('classes_tbl', { select: '*' }),
          rest('sections_tbl', { select: '*' }),
          rest('stages_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
          rest('divisions_tbl', { select: '*' }).catch(() => []),
          rest('curriculums_tbl', { select: '*' }).catch(() => []),
        ]);
        setClasses(clTbl || []);
        setSections(secRows || []);
        setStages([...new Map((stgRows || []).map(s => [s.stageid, s])).values()]);
        setDivisions(divRows || []);
        setCurriculums(curRows || []);
      } catch (e) {
        addToast(t('failedToLoadForms', lang), 'error');
      } finally {
        setLoadingDropdowns(false);
      }
    })();
  }, [user]);

  const handleSave = async () => {
    if ((!form.studentfirstname_en && !form.studentfirstname_ar) || !form.classid || !form.sectionid || !form.stageid) {
      addToast(t('studentFirstNameReq', lang), 'warning');
      return;
    }
    setIsLoading(true);
    try {
      const newStudentId = await nextId('students_tbl', 'studentid');
      const fullNameAr = [form.studentfirstname_ar, form.studentfathersname_ar, form.studentsurname_ar].filter(Boolean).join(' ');
      const fullNameEn = [form.studentfirstname_en, form.studentfathersname_en, form.studentsurname_en].filter(Boolean).join(' ');
      const [newStu] = await insert('students_tbl', {
        studentid:                  newStudentId,
        studentname:                fullNameAr || fullNameEn,
        studentfirstname_ar:        form.studentfirstname_ar        || null,
        studentfirstname_en:        form.studentfirstname_en        || null,
        studentfathersname_ar:      form.studentfathersname_ar      || null,
        studentfathersname_en:      form.studentfathersname_en      || null,
        studentgrandfathersname_ar: form.studentgrandfathersname_ar || null,
        studentgrandfathersname_en: form.studentgrandfathersname_en || null,
        studentsurname_ar:          form.studentsurname_ar          || null,
        studentsurname_en:          form.studentsurname_en          || null,
        studentemail:               form.studentemail               || null,
        studentmobile:              form.studentmobile              || null,
        parentname:                 getField(form, 'parentname_ar', 'parentname_en', lang) || form.parentname_ar || null,
        parentname_ar:              form.parentname_ar              || null,
        parentname_en:              getField(form, 'parentname_ar', 'parentname_en', lang)              || null,
        parentemail:                form.parentemail                || null,
        parentmobile:               form.parentmobile               || null,
        parent_position:            form.parent_position            || null,
      });
      await insert('students_sections_classes_tbl', {
        studentid:    newStu.studentid,
        classid:      parseInt(form.classid,      10),
        sectionid:    parseInt(form.sectionid,    10),
        stageid:      parseInt(form.stageid,      10),
        schoolid:     user.schoolid,
        branchid:     user.branchid,
        divisionid:   parseInt(form.divisionid   || user.divisionid   || 1, 10),
        curriculumid: parseInt(form.curriculumid || user.curriculumid || 1, 10),
      });
      addToast(t('studentEnrolledSuccess', lang), 'success');
      navigate('/admin/students');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const inp  = 'input-field h-10 w-full text-sm';
  const sel  = 'input-field h-10 w-full text-sm';
  const lbl  = 'text-xs font-bold text-[#64748b] mb-1 block';
  const sect = 'text-xs font-black text-[#0f172a] uppercase tracking-wider pb-2 border-b border-[#e2e8f0] mb-4';

  if (loadingDropdowns) return (
    <div className="flex items-center justify-center py-32 text-[#94a3b8]">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('loadingFormData', lang)}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/students')}
          className="flex items-center gap-2 text-sm font-bold text-[#64748b] hover:text-[#0f172a] transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 border border-[#e2e8f0]">
          <ArrowLeft className="h-4 w-4" /> {t('backToStudents', lang)}
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('enrollNewStudent', lang)}</h1>
          <p className="text-[#64748b] text-sm">{t('fillStudentDetails', lang)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-6 sm:p-8 space-y-8">

        {/* Student Name */}
        <div>
          <p className={sect}>{t('studentNameFields', lang)}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><label className={lbl}>{t('firstNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="الاسم الأول" value={form.studentfirstname_ar} onChange={e => set('studentfirstname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('firstNameEn', lang)} *</label><input className={inp} placeholder="First name" value={form.studentfirstname_en} onChange={e => set('studentfirstname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('fatherNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم الأب" value={form.studentfathersname_ar} onChange={e => set('studentfathersname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('fatherNameEn', lang)}</label><input className={inp} placeholder="Father's name" value={form.studentfathersname_en} onChange={e => set('studentfathersname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('grandfatherNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم الجد" value={form.studentgrandfathersname_ar} onChange={e => set('studentgrandfathersname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('grandfatherNameEn', lang)}</label><input className={inp} placeholder="Grandfather's name" value={form.studentgrandfathersname_en} onChange={e => set('studentgrandfathersname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('surnameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم العائلة" value={form.studentsurname_ar} onChange={e => set('studentsurname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('surnameEn', lang)}</label><input className={inp} placeholder="Surname" value={form.studentsurname_en} onChange={e => set('studentsurname_en', e.target.value)} /></div>
          </div>
        </div>

        {/* Student Contact */}
        <div>
          <p className={sect}>{t('studentContact', lang)}</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t('email', lang)}</label><input className={inp} type="email" placeholder="student@email.com" value={form.studentemail} onChange={e => set('studentemail', e.target.value)} /></div>
            <div><label className={lbl}>{t('mobile', lang)}</label><input className={inp} placeholder="0791000001" value={form.studentmobile} onChange={e => set('studentmobile', e.target.value)} /></div>
          </div>
        </div>

        {/* Parent / Guardian */}
        <div>
          <p className={sect}>{t('parentGuardian', lang)}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div><label className={lbl}>{t('parentNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم ولي الأمر" value={form.parentname_ar} onChange={e => set('parentname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('parentNameEn', lang)}</label><input className={inp} placeholder="Parent full name" value={getField(form, 'parentname_ar', 'parentname_en', lang)} onChange={e => set('parentname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('occupation', lang)}</label><input className={inp} placeholder="e.g. Government Employee" value={form.parent_position} onChange={e => set('parent_position', e.target.value)} /></div>
            <div><label className={lbl}>{t('parentEmail', lang)}</label><input className={inp} type="email" placeholder="parent@email.com" value={form.parentemail} onChange={e => set('parentemail', e.target.value)} /></div>
            <div><label className={lbl}>{t('parentMobile', lang)}</label><input className={inp} placeholder="0791100001" value={form.parentmobile} onChange={e => set('parentmobile', e.target.value)} /></div>
          </div>
        </div>

        {/* Class Assignment */}
        <div>
          <p className={sect}>{t('classAssignment', lang)} *</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className={lbl}>{t('class', lang)} *</label>
              <select className={sel} value={form.classid} onChange={e => set('classid', e.target.value)}>
                <option value="">{t('selectClass', lang)}</option>
                {classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('section', lang)} *</label>
              <select className={sel} value={form.sectionid} onChange={e => set('sectionid', e.target.value)}>
                <option value="">{t('selectSection', lang)}</option>
                {sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('stage', lang)} *</label>
              <select className={sel} value={form.stageid} onChange={e => set('stageid', e.target.value)}>
                <option value="">{t('selectStage', lang)}</option>
                {stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('division', lang)}</label>
              <select className={sel} value={form.divisionid} onChange={e => set('divisionid', e.target.value)}>
                <option value="">{t('default', lang)}</option>
                {divisions.map(d => <option key={d.divisionid} value={d.divisionid}>{getField(d, 'divisionname', 'divisionname_en', lang) || d.divisionname}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('curriculum', lang)}</label>
              <select className={sel} value={form.curriculumid} onChange={e => set('curriculumid', e.target.value)}>
                <option value="">{t('default', lang)}</option>
                {curriculums.map(c => <option key={c.curriculumid} value={c.curriculumid}>{getField(c, 'curriculumname', 'curriculumname_en', lang) || c.curriculumname}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={() => navigate('/admin/students')}
          className="px-6 py-2.5 font-bold text-[#64748b] border border-[#e2e8f0] rounded-xl hover:bg-slate-50 transition-colors">
          {t('cancel', lang)}
        </button>
        <button onClick={handleSave} disabled={isLoading}
          className="btn-primary h-11 px-8 flex items-center gap-2 disabled:opacity-60">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {t('enrollStudent', lang)}
        </button>
      </div>
    </div>
  );
}
