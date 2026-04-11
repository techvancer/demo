import { t, getField, getStudentName as _getStudentName } from '../lib/langHelper';
import { useLang } from '../context/LanguageContext';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { rest, insert, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../lib/supabaseClient';

const BASE = `${SUPABASE_URL}/rest/v1`;




export default function CreateExam() {
    const { lang, isAr } = useLang();

  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const { user } = useAuth();
  const backPath = user?.role === 'Admin' ? '/admin/exams' : '/exams';

  const [mySections, setMySections] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    classid: '',
    sectionid: '',
    subjectid: '',
    examid: '',
    questionCount: '',
    questions: []
  });

  useEffect(() => {
    if (!user?.employeeid || !user?.schoolid || !user?.branchid) return;

    let ignore = false;

    const loadTeacherAssignments = async () => {
      try {
        const [empSecSub, clTbl, secTbl, subTbl, examTbl] = await Promise.all([
          rest('employees_sections_subjects_classes_semisters_curriculums_tbl', {
            employeeid: `eq.${user.employeeid}`,
            schoolid: `eq.${user.schoolid}`,
            branchid: `eq.${user.branchid}`,
            select: '*'
          }),
          rest('classes_tbl', { select: '*' }),
          rest('sections_tbl', { select: '*' }),
          rest('subjects_tbl', { select: '*' }),
          rest('exams_tbl', { select: '*' })
        ]);

        const assignmentRows = Array.isArray(empSecSub) ? empSecSub : [];
        const classesRows = Array.isArray(clTbl) ? clTbl : [];
        const sectionsRows = Array.isArray(secTbl) ? secTbl : [];
        const subjectsRows = Array.isArray(subTbl) ? subTbl : [];
        const examsRows = Array.isArray(examTbl) ? examTbl : [];

        const unique = [];
        const seen = new Set();

        for (const r of assignmentRows) {
          const key = [
            r.employeeid,
            r.schoolid,
            r.branchid,
            r.classid,
            r.sectionid,
            r.subjectid,
            r.semisterid,
            r.curriculumid,
            r.divisionid,
            r.stageid,
            r.yearid
          ].join('-');

          if (seen.has(key)) continue;
          seen.add(key);

          const cl = classesRows.find(c => String(c.classid) === String(r.classid));
          const sec = sectionsRows.find(s => String(s.sectionid) === String(r.sectionid));
          const sub = subjectsRows.find(s => String(s.subjectid) === String(r.subjectid));

          const rawClassName = getField(cl, 'classname', 'classname_en', lang) || cl?.classname || '';
          const classLabel = rawClassName && /^\d+$/.test(String(rawClassName))
            ? `Classes ${rawClassName}`
            : (rawClassName || `Classes ${r.classid}`);

          unique.push({
            ...r,
            classname: classLabel,
            sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || `Section ${r.sectionid}`,
            subjectname: getField(sub, 'subjectname', 'Subjectname_en', lang) || sub?.subjectname_en || getField(sub, 'subjectname', 'Subjectname_en', lang) || sub?.subjectname || `Subject ${r.subjectid}`
          });
        }

        if (!ignore) {
          setMySections(unique);
          setExamTypes(examsRows);
        }
      } catch (err) {
        console.error('CreateExam loadTeacherAssignments error:', err);
        if (!ignore) {
          setMySections([]);
          setExamTypes([]);
        }
      }
    };

    loadTeacherAssignments();
    return () => { ignore = true; };
  }, [user]);

  // Inherit Filters from Location State
  useEffect(() => {
    if (location.state?.filters && mySections.length > 0) {
      const f = location.state.filters;
      setFormData(prev => {
        // Only override if not already set manually
        const next = { ...prev };
        if (!next.classid && f.classid && f.classid !== 'All') next.classid = f.classid;
        if (!next.sectionid && f.sectionid && f.sectionid !== 'All') next.sectionid = f.sectionid;
        if (!next.subjectid && f.subjectid && f.subjectid !== 'All') next.subjectid = f.subjectid;
        if (!next.examid && f.examid && f.examid !== 'All') next.examid = f.examid;
        return next;
      });
    }
  }, [location.state, mySections]);

  // Auto-Select Single Option Logic
  useEffect(() => {
    if (classOptions.length === 1 && !formData.classid) {
       setField('classid', classOptions[0].value);
    }
  }, [classOptions]);

  useEffect(() => {
    if (sectionOptions.length === 1 && !formData.sectionid && formData.classid) {
       setField('sectionid', sectionOptions[0].value);
    }
  }, [sectionOptions, formData.classid]);

  useEffect(() => {
    if (subjectOptions.length === 1 && !formData.subjectid && formData.sectionid) {
       setField('subjectid', subjectOptions[0].value);
    }
  }, [subjectOptions, formData.sectionid]);

  useEffect(() => {
    if (examTypes.length === 1 && !formData.examid) {
       setField('examid', String(examTypes[0].examid));
    }
  }, [examTypes]);

  const classOptions = useMemo(() => {
    const map = new Map();
    mySections.forEach(r => {
      if (!map.has(String(r.classid))) {
        map.set(String(r.classid), { value: String(r.classid), label: r.classname || '' });
      }
    });
    return Array.from(map.values());
  }, [mySections]);

  const sectionOptions = useMemo(() => {
    const map = new Map();
    mySections
      .filter(r => !formData.classid || String(r.classid) === String(formData.classid))
      .forEach(r => {
        if (!map.has(String(r.sectionid))) {
          map.set(String(r.sectionid), { value: String(r.sectionid), label: r.sectionname });
        }
      });
    return Array.from(map.values());
  }, [mySections, formData.classid]);

  const subjectOptions = useMemo(() => {
    const map = new Map();
    mySections
      .filter(r => (!formData.classid || String(r.classid) === String(formData.classid)) &&
                   (!formData.sectionid || String(r.sectionid) === String(formData.sectionid)))
      .forEach(r => {
        if (!map.has(String(r.subjectid))) {
          map.set(String(r.subjectid), { value: String(r.subjectid), label: r.subjectname });
        }
      });
    return Array.from(map.values());
  }, [mySections, formData.classid, formData.sectionid]);

  const selectedAssignment = useMemo(() => (
    mySections.find(r =>
      String(r.classid) === String(formData.classid) &&
      String(r.sectionid) === String(formData.sectionid) &&
      String(r.subjectid) === String(formData.subjectid)
    ) || null
  ), [mySections, formData.classid, formData.sectionid, formData.subjectid]);

  const setField = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'classid') {
        next.sectionid = '';
        next.subjectid = '';
      }
      if (field === 'sectionid') {
        next.subjectid = '';
      }
      return next;
    });
  };

  const handleGenerateQuestions = () => {
    const count = parseInt(formData.questionCount, 10);
    const nextErrors = {};
    if (!formData.classid) nextErrors.classid = 'Select a class';
    if (!formData.sectionid) nextErrors.sectionid = 'Select a section';
    if (!formData.subjectid) nextErrors.subjectid = 'Select a subject';
    if (!formData.examid) nextErrors.examid = 'Select an exam type';
    if (!count || count < 1) nextErrors.questionCount = 'Enter a valid number of questions';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setFormData(prev => ({
      ...prev,
      questions: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        questionMark: prev.questions[i]?.questionMark || '',
        videoUrl: prev.questions[i]?.videoUrl || ''
      }))
    }));
  };

  const updateQuestion = (idx, value) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => i === idx ? { ...q, videoUrl: value } : q)
    }));
  };

  const updateQuestionMark = (idx, value) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => i === idx ? { ...q, questionMark: value } : q)
    }));
  };

  const validateBeforeSave = () => {
    const e = {};
    if (!formData.classid) e.classid = 'Select a class';
    if (!formData.sectionid) e.sectionid = 'Select a section';
    if (!formData.subjectid) e.subjectid = 'Select a subject';
    if (!formData.examid) e.examid = 'Select an exam type';
    if (!formData.questions.length) e.questions = 'Press Add to generate the questions table';
    // Validate every question mark is filled and > 0
    const missingMarks = formData.questions
        .map((q, i) => ({ idx: i, val: q.questionMark }))
        .filter(({ val }) => val === '' || val === undefined || val === null || parseFloat(val) <= 0);
    if (missingMarks.length > 0) {
        e.questionMarks = missingMarks.map(m => m.idx);
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateBeforeSave() || !selectedAssignment) return;
    setSaving(true);
    try {
      // ── Check for duplicate: same teacher + exam + class + section + subject ──
      const duplicateCheck = await fetch(
        `${BASE}/questions_exams_employee_subjects_sections_tbl?examid=eq.${formData.examid}&employeeid=eq.${user.employeeid}&classid=eq.${selectedAssignment.classid}&sectionid=eq.${selectedAssignment.sectionid}&subjectid=eq.${selectedAssignment.subjectid}&select=questionid&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const dupRows = await duplicateCheck.json();
      if (dupRows?.length > 0) {
        addToast('You have already created this exam for this class, section and subject. You cannot add it again.', 'error');
        setSaving(false);
        return;
      }

      const base = {
        examid: parseInt(formData.examid, 10),
        employeeid: user.employeeid,
        subjectid: selectedAssignment.subjectid,
        sectionid: selectedAssignment.sectionid,
        classid: selectedAssignment.classid,
        semisterid: selectedAssignment.semisterid || 1,
        yearid: selectedAssignment.yearid || 2026,
        stageid: selectedAssignment.stageid,
        curriculumid: selectedAssignment.curriculumid || 1,
        divisionid: selectedAssignment.divisionid || 1,
        branchid: user.branchid,
        schoolid: user.schoolid,
      };

      let nextQid = 1; // questionid always starts at 1 per teacher+exam+class+section+subject

      for (const q of formData.questions) {
        await insert('questions_exams_employee_subjects_sections_tbl', {
          ...base,
          questionid: nextQid,
          typeid: 1,
          question_marks: parseFloat(q.questionMark),
          video_url: q.videoUrl || null,
          notes: null,
        });
        nextQid++;
      }

      const students = await rest('students_sections_classes_tbl', {
        classid: `eq.${selectedAssignment.classid}`,
        sectionid: `eq.${selectedAssignment.sectionid}`,
        schoolid: `eq.${user.schoolid}`,
        branchid: `eq.${user.branchid}`,
        select: 'studentid',
      });

      for (const stu of students || []) {
        const existing = await rest('students_exams_employees_section_subjects_classes_semisters_cur', {
          studentid: `eq.${stu.studentid}`,
          examid: `eq.${base.examid}`,
          employeeid: `eq.${user.employeeid}`,
          classid: `eq.${selectedAssignment.classid}`,
          sectionid: `eq.${selectedAssignment.sectionid}`,
          subjectid: `eq.${selectedAssignment.subjectid}`,
          select: 'studentid',
        });
        if (!existing?.length) {
          await insert('students_exams_employees_section_subjects_classes_semisters_cur', {
            ...base,
            studentid: stu.studentid,
          });
        }
      }

      addToast(`Exam created with ${formData.questions.length} question(s).`, 'success');
      navigate(backPath, { replace: true });
    } catch (e) {
      addToast(e.message || 'Failed to create exam', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(backPath)} className="p-2 rounded-full hover:bg-slate-200 transition-colors text-[#0f172a]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">Create New Exam</h1>
          <p className="text-[#64748b] text-sm">Set the exam details, choose how many questions it has, then add optional video URLs.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">Class</label>
            <select
              className={`input-field h-10 w-full ${errors.classid ? 'border-red-400' : ''}`}
              value={formData.classid}
              onChange={e => setField('classid', e.target.value)}
            >
              <option value="">-- Select Class --</option>
              {classOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.classid && <p className="text-xs text-red-500 mt-1">{errors.classid}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">Section</label>
            <select
              className={`input-field h-10 w-full ${errors.sectionid ? 'border-red-400' : ''}`}
              value={formData.sectionid}
              onChange={e => setField('sectionid', e.target.value)}
              disabled={!formData.classid}
            >
              <option value="">-- Select Section --</option>
              {sectionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.sectionid && <p className="text-xs text-red-500 mt-1">{errors.sectionid}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">Subject</label>
            <select
              className={`input-field h-10 w-full ${errors.subjectid ? 'border-red-400' : ''}`}
              value={formData.subjectid}
              onChange={e => setField('subjectid', e.target.value)}
              disabled={!formData.sectionid}
            >
              <option value="">-- Select Subject --</option>
              {subjectOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.subjectid && <p className="text-xs text-red-500 mt-1">{errors.subjectid}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">Exam Type</label>
            <select
              className={`input-field h-10 w-full ${errors.examid ? 'border-red-400' : ''}`}
              value={formData.examid}
              onChange={e => setField('examid', e.target.value)}
            >
              <option value="">-- Select Exam --</option>
              {examTypes.map(ex => (
                <option key={ex.examid} value={ex.examid}>{getField(ex, 'examname', 'examname_en', lang) || ex.examname || `Exam ${ex.examid}`}</option>
              ))}
            </select>
            {errors.examid && <p className="text-xs text-red-500 mt-1">{errors.examid}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">How many questions for this exam?</label>
            <input
              type="number"
              min="1"
              value={formData.questionCount}
              onChange={e => setField('questionCount', e.target.value)}
              className={`input-field h-10 w-full ${errors.questionCount ? 'border-red-400' : ''}`}
              placeholder="Answer here"
            />
            {errors.questionCount && <p className="text-xs text-red-500 mt-1">{errors.questionCount}</p>}
          </div>

          <button
            type="button"
            onClick={handleGenerateQuestions}
            className="px-6 h-10 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
        </div>

        {selectedAssignment && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-[#1d4ed8] font-medium">
            {selectedAssignment.classname} · Section {selectedAssignment.sectionname} · {selectedAssignment.subjectname}
          </div>
        )}
      </div>

      {formData.questions.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <h2 className="font-bold text-[#0f172a] text-base">Questions Table</h2>
              <p className="text-sm text-[#64748b]">Enter a YouTube video URL for any question if needed.</p>
            </div>
            <span className="text-sm font-semibold text-[#1d4ed8]">{formData.questions.length} Questions</span>
          </div>

          {errors.questions && <p className="text-sm text-red-500 px-6 pt-4">{errors.questions}</p>}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3 w-32">Question</th>
                  <th className="text-left px-6 py-3 w-48 whitespace-nowrap">Question Mark <span className="text-red-500">*</span></th>
                  <th className="text-left px-6 py-3">YouTube Video URL (Optional)</th>
                </tr>
              </thead>
              <tbody>
                {formData.questions.map((q, idx) => (
                  <tr key={q.id} className="border-t border-[#e2e8f0]">
                    <td className="px-6 py-4 font-semibold text-[#0f172a]">Q{idx + 1}</td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={q.questionMark}
                        onChange={e => updateQuestionMark(idx, e.target.value)}
                        placeholder="e.g. 5"
                        className={`input-field h-10 w-full text-sm ${errors.questionMarks?.includes(idx) ? 'border-red-400 bg-red-50' : ''}`}
                      />
                      {errors.questionMarks?.includes(idx) && (
                        <p className="text-xs text-red-500 mt-1 font-medium">Required</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="url"
                        value={q.videoUrl}
                        onChange={e => updateQuestion(idx, e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="input-field h-10 w-full font-mono text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(backPath)}
          className="px-6 py-2.5 border border-[#e2e8f0] rounded-lg text-sm font-bold text-[#475569] hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="btn-primary px-8 py-2.5 flex items-center gap-2 shadow-md disabled:opacity-60"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save Exam</>}
        </button>
      </div>
    </div>
  );
}
