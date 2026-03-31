import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, update, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';

const sanitizePhone = (value = '') => String(value).replace(/\D/g, '').slice(0, 10);
const isTenDigitPhone = (value = '') => /^\d{10}$/.test(String(value || '').trim());

export default function AdminEditStudent() {
  const { lang } = useLang();
  const { addToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [classes, setClasses]       = useState([]);
  const [sections, setSections]     = useState([]);
  const [stages, setStages]         = useState([]);
  const [divisions, setDivisions]   = useState([]);
  const [curriculums, setCurriculums] = useState([]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Load dropdowns and student data in parallel
        const [clTbl, secRows, stgRows, divRows, curRows, stuRows, stuScRows] = await Promise.all([
          rest('classes_tbl', { select: '*' }),
          rest('sections_tbl', { select: '*' }),
          rest('stages_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
          rest('divisions_tbl', { select: '*' }).catch(() => []),
          rest('curriculums_tbl', { select: '*' }).catch(() => []),
          rest('students_tbl', { studentid: `eq.${id}`, select: '*' }),
          rest('students_sections_classes_tbl', { studentid: `eq.${id}`, select: '*' }),
        ]);

        setClasses(clTbl || []);
        setSections(secRows || []);
        setStages([...new Map((stgRows || []).map(s => [s.stageid, s])).values()]);
        setDivisions(divRows || []);
        setCurriculums(curRows || []);

        // Use student passed via location.state if available, else from DB
        const stu = (stuRows && stuRows[0]) || location.state?.student || null;
        const sc  = stuScRows && stuScRows[0];

        if (!stu) {
          addToast('Student not found.', 'error');
          navigate('/admin/students');
          return;
        }

        setForm({
          studentfirstname_ar:        stu.studentfirstname_ar        || '',
          studentfirstname_en:        stu.studentfirstname_en        || '',
          studentfathersname_ar:      stu.studentfathersname_ar      || '',
          studentfathersname_en:      stu.studentfathersname_en      || '',
          studentgrandfathersname_ar: stu.studentgrandfathersname_ar || '',
          studentgrandfathersname_en: stu.studentgrandfathersname_en || '',
          studentsurname_ar:          stu.studentsurname_ar          || '',
          studentsurname_en:          stu.studentsurname_en          || '',
          studentemail:               stu.studentemail               || '',
          studentmobile:              stu.studentmobile              || '',
          parentname_ar:              stu.parentname_ar || stu.parentname || '',
          parentname_en:              stu.parentname_en || stu.parentname || '',
          parentemail:                stu.parentemail                || '',
          parentmobile:               stu.parentmobile               || '',
          parent_position:            stu.parent_position            || '',
          classid:     String(sc?.classid     || ''),
          sectionid:   String(sc?.sectionid   || ''),
          stageid:     String(sc?.stageid     || ''),
          divisionid:  String(sc?.divisionid  || ''),
          curriculumid: String(sc?.curriculumid || ''),
          _studentid: stu.studentid,
        });
      } catch (e) {
        addToast(e.message, 'error');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user, id, lang]);

  const handleSave = async () => {
    if (!form) return;
    if ((form.studentmobile && !isTenDigitPhone(form.studentmobile)) || (form.parentmobile && !isTenDigitPhone(form.parentmobile))) {
      addToast('Phone numbers must be exactly 10 digits.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await update('students_tbl', form._studentid, 'studentid', {
        studentname: [form.studentfirstname_ar, form.studentfathersname_ar, form.studentsurname_ar].filter(Boolean).join(' ') || [form.studentfirstname_en, form.studentfathersname_en, form.studentsurname_en].filter(Boolean).join(' '),
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
        parentname: form.parentname_ar || form.parentname_en || null,
        parentname_ar:              form.parentname_ar              || null,
        parentname_en:              form.parentname_en              || null,
        parentemail:                form.parentemail                || null,
        parentmobile:               form.parentmobile               || null,
        parent_position:            form.parent_position            || null,
      });
      await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${form._studentid}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classid:      parseInt(form.classid,                     10),
          sectionid:    parseInt(form.sectionid,                   10),
          stageid:      parseInt(form.stageid,                     10),
          divisionid:   parseInt(form.divisionid  || user.divisionid  || 1, 10),
          curriculumid: parseInt(form.curriculumid || user.curriculumid || 1, 10),
        }),
      });
      addToast(t('updateSuccess', lang), 'success');
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

  if (loadingData || !form) return (
    <div className="flex items-center justify-center py-32 text-[#94a3b8]">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('loadingFormData', lang)}
    </div>
  );


    // Re-fetch when language changes

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/students')}
          className="flex items-center gap-2 text-sm font-bold text-[#64748b] hover:text-[#0f172a] transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 border border-[#e2e8f0]">
          <ArrowLeft className="h-4 w-4" /> {t('backToStudents', lang)}
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('editStudent', lang)} #{form._studentid}</h1>
          <p className="text-[#64748b] text-sm">{t('fillStudentDetails', lang)}</p>
          <Breadcrumb />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-6 sm:p-8 space-y-8">

        {/* Student Name */}
        <div>
          <p className={sect}>{t('studentNameFields', lang)}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><label className={lbl}>{t('firstNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="الاسم الأول" value={form.studentfirstname_ar} onChange={e => set('studentfirstname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('firstNameEn', lang)} *</label><input className={inp} placeholder={isAr ? "الاسم الأول" : "First name"} value={form.studentfirstname_en} onChange={e => set('studentfirstname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('fatherNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم الأب" value={form.studentfathersname_ar} onChange={e => set('studentfathersname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('fatherNameEn', lang)}</label><input className={inp} placeholder={isAr ? "اسم الأب" : "Father's name"} value={form.studentfathersname_en} onChange={e => set('studentfathersname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('grandfatherNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم الجد" value={form.studentgrandfathersname_ar} onChange={e => set('studentgrandfathersname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('grandfatherNameEn', lang)}</label><input className={inp} placeholder={isAr ? "اسم الجد" : "Grandfather's name"} value={form.studentgrandfathersname_en} onChange={e => set('studentgrandfathersname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('surnameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم العائلة" value={form.studentsurname_ar} onChange={e => set('studentsurname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('surnameEn', lang)}</label><input className={inp} placeholder={isAr ? "اسم العائلة" : "Surname"} value={form.studentsurname_en} onChange={e => set('studentsurname_en', e.target.value)} /></div>
          </div>
        </div>

        {/* Student Contact */}
        <div>
          <p className={sect}>{t('studentContact', lang)}</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t('email', lang)}</label><input className={inp} type="email" placeholder={isAr ? "بريد_الطالب@example.com" : "student@email.com"} value={form.studentemail} onChange={e => set('studentemail', e.target.value)} /></div>
            <div><label className={lbl}>{t('mobile', lang)}</label><input className={inp} placeholder="0791000001" type="tel" maxLength={10} minLength={10} pattern="\d{10}" inputMode="numeric" value={form.studentmobile} onChange={e => set('studentmobile', sanitizePhone(e.target.value))} onInput={(e) => { e.target.value = sanitizePhone(e.target.value); }} /></div>
          </div>
        </div>

        {/* Parent / Guardian */}
        <div>
          <p className={sect}>{t('parentGuardian', lang)}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div><label className={lbl}>{t('parentNameAr', lang)}</label><input className={inp} dir="rtl" placeholder="اسم ولي الأمر" value={form.parentname_ar} onChange={e => set('parentname_ar', e.target.value)} /></div>
            <div><label className={lbl}>{t('parentNameEn', lang)}</label><input className={inp} placeholder="Parent full name" value={form.parentname_en} onChange={e => set('parentname_en', e.target.value)} /></div>
            <div><label className={lbl}>{t('occupation', lang)}</label><input className={inp} placeholder="e.g. Government Employee" value={form.parent_position} onChange={e => set('parent_position', e.target.value)} /></div>
            <div><label className={lbl}>{t('parentEmail', lang)}</label><input className={inp} type="email" placeholder="parent@email.com" value={form.parentemail} onChange={e => set('parentemail', e.target.value)} /></div>
            <div><label className={lbl}>{t('parentMobile', lang)}</label><input className={inp} placeholder="0791100001" type="tel" maxLength={10} minLength={10} pattern="\d{10}" inputMode="numeric" value={form.parentmobile} onChange={e => set('parentmobile', sanitizePhone(e.target.value))} onInput={(e) => { e.target.value = sanitizePhone(e.target.value); }} /></div>
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
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('saveChanges', lang)}
        </button>
      </div>
    </div>
  );
}
