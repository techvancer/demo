import { t, getField, getStudentName as _getStudentName } from '../lib/langHelper';
import { useLang } from '../context/LanguageContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Upload, Download, FileSpreadsheet } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { insert, rest, update, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../lib/supabaseClient';
import { parseCsvText } from '../lib/adminCsv';

const BASE = `${SUPABASE_URL}/rest/v1`;


async function deleteAnswers(filters) {
    const params = Object.entries(filters)
        .map(([key, value]) => `${key}=eq.${value}`)
        .join('&');

    const response = await fetch(`${BASE}/studentanswers_tbl?${params}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });

    if (!response.ok) {
        let message = 'Failed to clear previous grades';
        try {
            const data = await response.json();
            message = data.message || message;
        } catch {
            // ignore json parse errors
        }
        throw new Error(message);
    }
}

export default function TeacherExamUpload() {
    const { lang, isAr } = useLang();

    const navigate = useNavigate();
    const { addToast } = useToast();
    const { user } = useAuth();
    const { examid, classid, sectionid, subjectid } = useParams();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileName, setFileName] = useState('');
    const [meta, setMeta] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [students, setStudents] = useState([]);
    const [marks, setMarks] = useState({});
    const [markErrors, setMarkErrors] = useState({});
    const [nameSort, setNameSort] = useState('asc');
    const sortedStudents = [...(students || [])].sort((a, b) => {
        const an = (_getStudentName(a, lang) || '').toLowerCase();
        const bn = (_getStudentName(b, lang) || '').toLowerCase();
        return nameSort === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an);
    });
    const [csvErrors, setCsvErrors] = useState([]); // [{studentName, qLabel, entered, max}]
    // Change 4: track count of students with real answers in DB
    const [dbAnsweredCount, setDbAnsweredCount] = useState(0);
    const [preview, setPreview] = useState(null);

    const activeTab = 'upload';
    const rawExamStatus = String(meta?.status || '').toLowerCase();
    const effectiveExamStatus = rawExamStatus === 'cancelled'
        ? 'cancelled'
        : rawExamStatus === 'submitted'
            ? 'submitted'
            : ['marked', 'completed', 'inprogress'].includes(rawExamStatus) || dbAnsweredCount > 0
                ? 'marked'
                : 'new';
    const isManualEntryLocked = ['marked', 'submitted', 'cancelled'].includes(effectiveExamStatus);

    const loadData = useCallback(async () => {
        if (!user) return;

        setLoading(true);
        try {
            const [examRows, classRows, sectionRows, subjectRows, questionRows, sectionStudentRows, studentRows, existingAnswers, assignmentRows] = await Promise.all([
                rest('exams_tbl', { examid: `eq.${examid}`, select: '*' }),
                rest('classes_tbl', { classid: `eq.${classid}`, select: '*' }),
                rest('sections_tbl', { sectionid: `eq.${sectionid}`, select: '*' }),
                rest('subjects_tbl', { subjectid: `eq.${subjectid}`, select: 'subjectid,subjectname,Subjectname_en' }),
                rest('questions_exams_employee_subjects_sections_tbl', {
                    examid: `eq.${examid}`,
                    employeeid: `eq.${user.employeeid}`,
                    classid: `eq.${classid}`,
                    sectionid: `eq.${sectionid}`,
                    subjectid: `eq.${subjectid}`,
                    select: 'questionid,question_marks',
                    order: 'questionid.asc',
                }),
                rest('students_sections_classes_tbl', {
                    classid: `eq.${classid}`,
                    sectionid: `eq.${sectionid}`,
                    schoolid: `eq.${user.schoolid}`,
                    select: 'studentid',
                }),
                rest('students_tbl', { select: '*' }),
                rest('studentanswers_tbl', {
                    examid: `eq.${examid}`,
                    employeeid: `eq.${user.employeeid}`,
                    classid: `eq.${classid}`,
                    sectionid: `eq.${sectionid}`,
                    subjectid: `eq.${subjectid}`,
                    select: 'studentid,questionid,studentmark',
                }),
                rest('employees_sections_subjects_classes_semisters_curriculums_tbl', {
                    employeeid: `eq.${user.employeeid}`,
                    classid: `eq.${classid}`,
                    sectionid: `eq.${sectionid}`,
                    subjectid: `eq.${subjectid}`,
                    select: 'stageid,curriculumid,divisionid,semisterid,yearid',
                }),
            ]);

            const exam = examRows[0];
            const cls = classRows[0];
            const section = sectionRows[0];
            const subject = subjectRows[0];
            const assignment = assignmentRows?.[0];
            const enrolledStudents = sectionStudentRows
                .map((row) => studentRows.find((student) => student.studentid === row.studentid))
                .filter(Boolean);
            // Store full question objects: [{questionid, question_marks}]
            const questionObjs = questionRows.map(r => ({
                questionid: r.questionid,
                question_marks: parseFloat(r.question_marks) || 1,
            }));

            const nextMarks = {};
            enrolledStudents.forEach((student) => {
                nextMarks[student.studentid] = {};
                questionObjs.forEach((q) => {
                    nextMarks[student.studentid][q.questionid] = '';
                });
            });

            existingAnswers.forEach((answer) => {
                if (!nextMarks[answer.studentid]) nextMarks[answer.studentid] = {};
                nextMarks[answer.studentid][answer.questionid] = answer.studentmark ?? '';
            });

            // Change 4: count students that ACTUALLY have answers in the DB
            const dbAnswered = new Set(existingAnswers.map(a => a.studentid)).size;
            setDbAnsweredCount(dbAnswered);

            setMeta({
                examid: Number(examid),
                classid: Number(classid),
                sectionid: Number(sectionid),
                subjectid: Number(subjectid),
                examname: getField(exam, 'examname', 'examname_en', lang) || exam?.examname || `Exam ${examid}`,
                classname: getField(cls, 'classname', 'classname_en', lang) || cls?.classname || classid,
                sectionname: getField(section, 'sectionname', 'sectionname_en', lang) || section?.sectionname || sectionid,
                subjectname: getField(subject, 'subjectname', 'Subjectname_en', lang) || subject?.subjectname || subjectid,
                stageid: assignment?.stageid || 1,
                curriculumid: assignment?.curriculumid || user.curriculumid || 1,
                divisionid: assignment?.divisionid || user.divisionid || 1,
                semisterid: assignment?.semisterid || 1,
                yearid: assignment?.yearid || 2026,
                status: String(exam?.status || '').toLowerCase(),
            });
            setQuestions(questionObjs);
            setStudents(enrolledStudents);
            setMarks(nextMarks);
        } catch (error) {
            addToast(error.message || 'Failed to load exam page', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, classid, examid, sectionid, subjectid, user, lang]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const tabs = [
        { id: 'upload', label: t('uploadGrades', lang) },
    ];

    const totalStudents = students.length;

    const handleMarkChange = (studentid, questionid, value) => {
        const qObj = questions.find(q => q.questionid === questionid);
        const maxMark = qObj ? qObj.question_marks : 100;
        const num = value === '' ? '' : Number(value);
        let error = '';
        if (value !== '' && (isNaN(num) || num < 0)) {
            error = t('mustBe0orAbove', lang);
        } else if (value !== '' && num > maxMark) {
            error = `${t('maxIs', lang)} ${maxMark}`;
        }
        const cleaned = value === '' ? '' : String(Math.max(0, Math.min(maxMark, Number(value) || 0)));
        setMarkErrors(prev => ({
            ...prev,
            [studentid]: { ...(prev[studentid] || {}), [questionid]: error },
        }));
        setMarks((prev) => ({
            ...prev,
            [studentid]: { ...(prev[studentid] || {}), [questionid]: cleaned },
        }));
    };

    const saveRows = useCallback(async (sourceMarks) => {
        if (!meta) return;

        let saved = 0;

        // Step 1: Ensure every student is enrolled in the exam before inserting answers.
        // This satisfies the FK constraint fk_studentmark_studexam on studentanswers_tbl.
        for (const student of students) {
            const existing = await rest('students_exams_employees_section_subjects_classes_semisters_cur', {
                studentid: `eq.${student.studentid}`,
                examid: `eq.${meta.examid}`,
                employeeid: `eq.${user.employeeid}`,
                classid: `eq.${meta.classid}`,
                sectionid: `eq.${meta.sectionid}`,
                subjectid: `eq.${meta.subjectid}`,
                select: 'studentid',
            });
            if (!existing?.length) {
                await insert('students_exams_employees_section_subjects_classes_semisters_cur', {
                    studentid: student.studentid,
                    examid: meta.examid,
                    employeeid: user.employeeid,
                    subjectid: meta.subjectid,
                    sectionid: meta.sectionid,
                    classid: meta.classid,
                    semisterid: meta.semisterid,
                    yearid: meta.yearid,
                    stageid: meta.stageid,
                    curriculumid: meta.curriculumid,
                    divisionid: meta.divisionid,
                    branchid: user.branchid,
                    schoolid: user.schoolid,
                });
            }
        }

        // Step 2: Delete all existing answers for this teacher+exam+class+section+subject,
        // then insert fresh. This prevents duplicate rows on repeated saves.
        await deleteAnswers({
            examid: meta.examid,
            employeeid: user.employeeid,
            subjectid: meta.subjectid,
            sectionid: meta.sectionid,
            classid: meta.classid,
        });

        // Step 3: Insert answers
        for (const student of students) {
            for (const qObj of questions) {
                const questionid = qObj.questionid;
                const value = sourceMarks?.[student.studentid]?.[questionid];
                if (value === '' || value === undefined || value === null) continue;

                await insert('studentanswers_tbl', {
                    questionid,
                    studentid: student.studentid,
                    examid: meta.examid,
                    employeeid: user.employeeid,
                    subjectid: meta.subjectid,
                    sectionid: meta.sectionid,
                    classid: meta.classid,
                    semisterid: meta.semisterid,
                    yearid: meta.yearid,
                    stageid: meta.stageid,
                    curriculumid: meta.curriculumid,
                    divisionid: meta.divisionid,
                    branchid: user.branchid,
                    schoolid: user.schoolid,
                    typeid: 1,
                    studentmark: String(value),
                });
                saved += 1;
            }
        }

        if (saved > 0) {
            const markParams = `examid=eq.${meta.examid}&employeeid=eq.${user.employeeid}&classid=eq.${meta.classid}&sectionid=eq.${meta.sectionid}&subjectid=eq.${meta.subjectid}&schoolid=eq.${user.schoolid}&branchid=eq.${user.branchid}`;
            const patchRes = await fetch(`${BASE}/questions_exams_employee_subjects_sections_tbl?${markParams}`, {
                method: 'PATCH',
                headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify({ status: 'marked' }),
            });
            if (!patchRes.ok) {
                const errBody = await patchRes.text();
                throw new Error(`Status update failed (${patchRes.status}): ${errBody}`);
            }
        }

        return saved;
    }, [meta, questions, students, user]);

    const handleSaveManual = async () => {
        if (!meta) return;
        if (isManualEntryLocked) {
            addToast('This exam can no longer be edited from Manual Entry. Please use Edit Marks.', 'warning');
            return;
        }
        // Block save if any mark errors exist
        const allErrors = [];
        students.forEach(student => {
            questions.forEach((q, idx) => {
                const err = markErrors?.[student.studentid]?.[q.questionid];
                if (err) {
                    const name = _getStudentName(student, lang) || `Student ${student.studentid}`;
                    allErrors.push({ studentName: name, qLabel: `Q${idx + 1}`, entered: marks?.[student.studentid]?.[q.questionid], max: q.question_marks });
                }
            });
        });
        if (allErrors.length > 0) {
            addToast(`Cannot save — ${allErrors.length} invalid mark(s). Fix the highlighted fields first.`, 'error');
            return;
        }
        setSaving(true);
        try {
            const saved = await saveRows(marks);
            addToast(`Saved ${saved || 0} mark record(s) to studentanswers_tbl.`, 'success');
            await loadData();
        } catch (error) {
            addToast(error.message || 'Failed to save grades', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTemplateDownload = () => {
        if (!students.length) {
            addToast('No students found for this exam.', 'warning');
            return;
        }

        const headers = ['student_id', 'student_name', ...questions.map((q, index) => `q${index + 1}(max:${q.question_marks})`)];
        const rows = students.map((student) => [
            student.studentid,
            _getStudentName(student, lang) || '',
            ...questions.map(() => ''),
        ]);
        const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${meta?.examname || 'exam'}-grades-template.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const previewRows = useMemo(() => preview?.rows?.slice(0, 5) || [], [preview]);

    const handleFileChange = async (event) => {
        if (isManualEntryLocked) {
            addToast('This exam can no longer be edited from this page. Please use Edit Marks.', 'warning');
            event.target.value = '';
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        try {
            const rows = await parseCsvText(await file.text());
            if (!rows.length) {
                addToast('The CSV file is empty or invalid.', 'error');
                setPreview(null);
                return;
            }
            const headers = Object.keys(rows[0]);
            setPreview({ headers, rows });
        } catch {
            addToast('Failed to read CSV file.', 'error');
            setPreview(null);
        }
    };

    const handleUpload = async () => {
        if (isManualEntryLocked) {
            addToast('This exam can no longer be edited from this page. Please use Edit Marks.', 'warning');
            return;
        }
        if (!preview) {
            addToast('Choose a CSV file first.', 'warning');
            return;
        }
        if (!questions.length) {
            addToast('This exam has no questions yet.', 'warning');
            return;
        }

        const studentIdHeader = preview.headers.find((header) => ['student_id', 'studentid', 'id'].includes(header));
        if (!studentIdHeader) {
            addToast('The file must include a student_id column.', 'error');
            return;
        }

        setUploading(true);
        setCsvErrors([]);
        try {
            const uploadedMarks = {};
            const validationErrors = [];
            const studentNameMap = {};
            students.forEach(s => {
                studentNameMap[s.studentid] = _getStudentName(s, lang) || `Student ${s.studentid}`;
            });

            preview.rows.forEach((row) => {
                const studentid = Number(row[studentIdHeader]);
                if (!studentid) return;
                if (!uploadedMarks[studentid]) uploadedMarks[studentid] = {};

                questions.forEach((qObj, index) => {
                    const questionid = qObj.questionid;
                    const maxMark = qObj.question_marks;
                    const colKey = Object.keys(row).find(k => k.toLowerCase().startsWith(`q${index + 1}`));
                    const rawValue = (colKey ? row[colKey] : (row[`question${index + 1}`] ?? row[String(questionid)] ?? '')).trim();
                    if (rawValue === '') {
                        uploadedMarks[studentid][questionid] = '';
                        return;
                    }
                    const numVal = Number(rawValue);
                    if (isNaN(numVal)) {
                        validationErrors.push({ studentName: studentNameMap[studentid] || `ID ${studentid}`, qLabel: `Q${index + 1}`, entered: rawValue, max: maxMark, reason: 'Not a number' });
                        uploadedMarks[studentid][questionid] = '';
                        return;
                    }
                    if (numVal < 0) {
                        validationErrors.push({ studentName: studentNameMap[studentid] || `ID ${studentid}`, qLabel: `Q${index + 1}`, entered: rawValue, max: maxMark, reason: 'Below 0' });
                        uploadedMarks[studentid][questionid] = '';
                        return;
                    }
                    if (numVal > maxMark) {
                        validationErrors.push({ studentName: studentNameMap[studentid] || `ID ${studentid}`, qLabel: `Q${index + 1}`, entered: rawValue, max: maxMark, reason: `Exceeds max (${maxMark})` });
                        uploadedMarks[studentid][questionid] = '';
                        return;
                    }
                    uploadedMarks[studentid][questionid] = String(numVal);
                });
            });

            if (validationErrors.length > 0) {
                setCsvErrors(validationErrors);
                addToast(`CSV has ${validationErrors.length} invalid value(s). Fix the errors shown below and re-upload.`, 'error');
                setUploading(false);
                return;
            }

            setMarks((prev) => ({ ...prev, ...uploadedMarks }));
            const saved = await saveRows({ ...marks, ...uploadedMarks });
            addToast(`Uploaded ${saved || 0} mark record(s) to studentanswers_tbl.`, 'success');
            setCsvErrors([]);
            setPreview(null);
            setFileName('');
            await loadData();
        } catch (error) {
            addToast(error.message || 'Upload failed', 'error');
        } finally {
            setUploading(false);
        }
    };

    if (loading) {

  return (
            <div className="flex items-center justify-center py-16 text-[#94a3b8]">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading exam page...
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
                        {t('class', lang)} {meta?.classname}
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-sm font-bold border border-blue-100">
                            {t('section', lang)} {meta?.sectionname}
                        </span>
                    </h1>
                    <p className="text-[#64748b] text-sm">{meta?.subjectname} • {totalStudents} {t('students', lang)} • {meta?.examname}</p>
                    <Breadcrumb />
                </div>
            </div>

            {/* Dashboard Cards - Show Progress */}
            <div className="grid grid-cols-4 gap-4">
                {/* Students Card */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-6">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">{t('students', lang)}</p>
                    <p className="text-3xl font-bold text-blue-900 mt-3">{totalStudents}</p>
                    <p className="text-xs text-blue-700 mt-2">{t('totalInClass', lang)}</p>
                </div>

                {/* Questions Card */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-6">
                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wide">{t('questions', lang)}</p>
                    <p className="text-3xl font-bold text-purple-900 mt-3">{questions.length}</p>
                    <p className="text-xs text-purple-700 mt-2">{t('inThisExam', lang)}</p>
                </div>

                {/* Marks Entered Card — Change 4: uses real DB answer count */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-6">
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wide">{t('marksEntered', lang)}</p>
                    <p className="text-3xl font-bold text-green-900 mt-3">
                        {dbAnsweredCount}/{totalStudents}
                    </p>
                    <p className="text-xs text-green-700 mt-2">{t('progress', lang)}</p>
                </div>

                {/* Status Card — Change 4: accurate status from DB data */}
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200 p-6">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">{t('status', lang)}</p>
                    <p className="text-3xl font-bold text-emerald-900 mt-3">
                        {t(effectiveExamStatus, lang) || effectiveExamStatus}
                    </p>
                    <p className="text-xs text-emerald-700 mt-2">{t('uploadStatus', lang)}</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
                <div className="flex border-b border-[#e2e8f0] gap-1 px-4">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`px-5 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === tab.id ? 'border-[#1d4ed8] text-[#1d4ed8]' : 'border-transparent text-[#64748b]'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-6 space-y-6">
                    <div className="border-2 border-dashed border-[#dbe4f0] rounded-2xl p-8 text-center bg-slate-50">
                        <div className="mx-auto h-14 w-14 rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center mb-4">
                            <FileSpreadsheet className="h-7 w-7 text-[#94a3b8]" />
                        </div>
                        <p className="text-lg font-bold text-[#0f172a] mb-1">{t('dragAndDrop', lang)}</p>
                        <p className="text-sm text-[#64748b] mb-5">{t('supportedFormat', lang)}</p>
                        {isManualEntryLocked && (
                            <p className="text-sm font-semibold text-amber-700 mb-4">This exam status is {effectiveExamStatus}. Upload and manual entry are locked here. Please use Edit Marks.</p>
                        )}
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                            <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold transition-all ${isManualEntryLocked ? 'border-[#e2e8f0] bg-slate-100 text-[#94a3b8] cursor-not-allowed' : 'border-[#dbe4f0] bg-white text-[#1d4ed8] cursor-pointer hover:bg-blue-50'}`}>
                                <Upload className="h-4 w-4" /> {t('chooseCsv', lang)}
                                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} disabled={isManualEntryLocked} />
                            </label>
                            <button
                                type="button"
                                onClick={handleTemplateDownload}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold transition-all ${isManualEntryLocked ? 'border-[#e2e8f0] bg-slate-100 text-[#94a3b8] cursor-not-allowed' : 'border-[#1d4ed8] bg-white text-[#1d4ed8] hover:bg-blue-50'}`}
                                disabled={isManualEntryLocked}
                            >
                                <Download className="h-4 w-4" /> {t('downloadTemplate', lang)}
                            </button>
                        </div>
                        {fileName && <p className="mt-4 text-sm text-[#475569]">Selected file: <span className="font-bold">{fileName}</span></p>}
                    </div>

                    {preview && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <h2 className="text-base font-bold text-[#0f172a]">{t('preview', lang)}</h2>
                                <button
                                    type="button"
                                    onClick={handleUpload}
                                    disabled={uploading || isManualEntryLocked}
                                    className="px-5 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-60"
                                >
                                    {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('uploading', lang)}</> : <><Upload className="h-4 w-4" /> {t('uploadGrades', lang)}</>}
                                </button>
                            </div>
                            <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-[#e2e8f0]">
                                        <tr>
                                            {preview.headers.map((header) => (
                                                <th key={header} className="py-3 px-4 text-xs font-black text-[#64748b] uppercase tracking-wider">{header}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e2e8f0]">
                                        {previewRows.map((row, index) => (
                                            <tr key={index}>
                                                {preview.headers.map((header) => (
                                                    <td key={header} className="py-3 px-4 text-[#475569]">{row[header]}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="border-t border-[#e2e8f0] pt-6">
                        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                            <h2 className="text-lg font-bold text-[#0f172a]">{t('manualEntry', lang)}</h2>
                            {isManualEntryLocked && <p className="text-sm text-[#64748b]">Manual entry is locked for marked, submitted, and cancelled exams. Please use Edit Marks.</p>}
                        </div>

                        {!students.length ? (
                            <div className="py-12 text-center text-[#94a3b8]">No students were found for this class and section.</div>
                        ) : !questions.length ? (
                            <div className="py-12 text-center text-[#94a3b8]">No exam questions were found. Create questions first, then upload grades.</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-[#e2e8f0]">
                                            <tr>
                                                <th className="py-4 px-4 text-xs font-black text-[#64748b] uppercase tracking-wider">{t('studentId', lang)}</th>
                                                <th className="py-4 px-4 text-xs font-black text-[#64748b] uppercase tracking-wider cursor-pointer select-none" onClick={() => setNameSort(s => s === 'asc' ? 'desc' : 'asc')}>
                                                    {t('name', lang)} <span className="text-[#1d4ed8]">{nameSort === 'asc' ? '▲' : '▼'}</span>
                                                </th>
                                                {questions.map((q, index) => (
                                                    <th key={q.questionid} className="py-4 px-4 text-xs font-black text-[#64748b] uppercase tracking-wider text-center">
                                                        <div>Q{index + 1}</div>
                                                        <div className="text-[10px] font-normal text-[#94a3b8] normal-case">max: {q.question_marks}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e2e8f0] bg-white">
                                            {sortedStudents.map((student) => (
                                                <motion.tr key={student.studentid} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                                    <td className="py-3 px-4 text-sm text-[#475569]">{student.studentid}</td>
                                                    <td className="py-3 px-4 text-sm font-bold text-[#0f172a]">{_getStudentName(student, lang)}</td>
                                                    {questions.map((q) => {
                                                        const qErr = markErrors?.[student.studentid]?.[q.questionid];
                                                        return (
                                                        <td key={q.questionid} className="py-3 px-4 text-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={q.question_marks}
                                                                step="0.25"
                                                                value={marks?.[student.studentid]?.[q.questionid] ?? ''}
                                                                onChange={(event) => handleMarkChange(student.studentid, q.questionid, event.target.value)}
                                                                disabled={isManualEntryLocked}
                                                                className={`w-20 h-10 text-center font-bold text-[#0f172a] border rounded-lg outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed ${qErr ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-[#dbe4f0] focus:border-[#1d4ed8] focus:ring-blue-100'}`}
                                                            />
                                                            {qErr && <div className="text-[10px] text-red-500 font-bold mt-0.5">{qErr}</div>}
                                                        </td>
                                                        );
                                                    })}
                                                </motion.tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleSaveManual}
                                        disabled={saving || isManualEntryLocked}
                                        className="px-6 py-2.5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-60"
                                    >
                                        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('saving', lang)}</> : <><Save className="h-4 w-4" /> {t('saveAllChanges', lang)}</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
