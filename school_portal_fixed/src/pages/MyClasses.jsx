import { t, getField, getStudentName as _getStudentName } from '../lib/langHelper';
import { useLang } from '../context/LanguageContext';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Book, Users, ChevronLeft, Loader2, ClipboardList, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { rest } from '../lib/supabaseClient';
import { getStudentFullName, getClassName, getSectionName, getSubjectName, getDivisionName, getCurriculumName, calcGrade, loadGrades, calcGradeFromList } from '../lib/helpers';
import { useSortable } from '../lib/useSortable';
import SortableTh from '../components/SortableTh';

function getExamStatusStyle(status) {
    if (status === 'completed') return 'bg-green-50 text-green-700 border-green-200';
    if (status === 'inprogress') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
}

export default function MyClasses() {
    const { lang, isAr } = useLang();

    const { user } = useAuth();
    const [selected, setSelected] = useState(null);
    const [allSections, setAllSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [colFilters, setColFilters] = useState({ classname: '', sectionname: '', subjectName: '', curriculumname: '', divisionname: '' });
    const setColFilter = (key, val) => setColFilters(prev => ({ ...prev, [key]: val }));

    // Apply column filters at render time
    const mySections = allSections.filter(s =>
        (!colFilters.classname    || s.classname?.toLowerCase().includes(colFilters.classname.toLowerCase())) &&
        (!colFilters.sectionname  || s.sectionname?.toLowerCase().includes(colFilters.sectionname.toLowerCase())) &&
        (!colFilters.subjectName  || s.subjectName?.toLowerCase().includes(colFilters.subjectName.toLowerCase())) &&
        (!colFilters.curriculumname || s.curriculumname?.toLowerCase().includes(colFilters.curriculumname.toLowerCase())) &&
        (!colFilters.divisionname || s.divisionname?.toLowerCase().includes(colFilters.divisionname.toLowerCase()))
    );
    const { sorted, sortCol, sortDir, handleSort } = useSortable(mySections, 'classname');

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                // Change 5: Fix destructuring order – stuScRows must match students_sections_classes_tbl position
                const [empSec, clTbl, secRows, subTbl, stuScRows, divTbl, curTbl, examEnroll, answers] = await Promise.all([
                    rest('employees_sections_subjects_classes_semisters_curriculums_tbl', {
                        employeeid: `eq.${user.employeeid}`, schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*'
                    }),
                    rest('classes_tbl', { select: 'classid,classname_en,classname' }),
                    rest('sections_tbl', { select: 'sectionid,sectionname_en,sectionname' }),
                    rest('subjects_tbl', { select: 'subjectid,subjectname,Subjectname_en' }),
                    // Change 5: students table MUST be index 4 to match stuScRows destructuring
                    rest('students_sections_classes_tbl', {
                        schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`,
                        select: 'studentid,classid,sectionid,divisionid,curriculumid'
                    }),
                    rest('divisions_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: 'divisionid,divisionname_en,divisionname' }).catch(() => []),
                    rest('curriculums_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: 'curriculumid,curriculumname_en,curriculumname' }).catch(() => []),
                    rest('students_exams_employees_section_subjects_classes_semisters_cur', {
                        employeeid: `eq.${user.employeeid}`, schoolid: `eq.${user.schoolid}`,
                        select: 'examid,classid,sectionid,subjectid'
                    }).catch(() => []),
                    rest('studentanswers_tbl', {
                        employeeid: `eq.${user.employeeid}`, schoolid: `eq.${user.schoolid}`,
                        select: 'examid,classid,sectionid,subjectid'
                    }).catch(() => []),
                ]);

                const answeredKeys = new Set((answers || []).map(a => `${a.examid}-${a.classid}-${a.sectionid}-${a.subjectid}`));

                const seen = new Set();
                const sections = empSec.filter(r => {
                    const k = `${r.classid}-${r.sectionid}-${r.subjectid}`;
                    if (seen.has(k)) return false; seen.add(k); return true;
                }).map(r => {
                    const cl = clTbl.find(c => c.classid === r.classid);
                    const sec = secRows.find(s => s.sectionid === r.sectionid);
                    const sub = subTbl.find(s => s.subjectid === r.subjectid);

                    // Change 5: Fix student count — use String comparison for type safety
                    const stuCount = (stuScRows || []).filter(s =>
                        String(s.classid) === String(r.classid) &&
                        String(s.sectionid) === String(r.sectionid)
                    ).length;

                    // Change 5: Division from the first matching student row
                    const sampleStu = (stuScRows || []).find(s =>
                        String(s.classid) === String(r.classid) &&
                        String(s.sectionid) === String(r.sectionid)
                    );
                    const div = (divTbl || []).find(d => String(d.divisionid) === String(sampleStu?.divisionid));
                    const cur = (curTbl || []).find(c => String(c.curriculumid) === String(r.curriculumid));

                    // Exam count
                    const examCount = (examEnroll || []).filter(e =>
                        String(e.classid) === String(r.classid) &&
                        String(e.sectionid) === String(r.sectionid) &&
                        String(e.subjectid) === String(r.subjectid)
                    ).length;

                    return {
                        ...r,
                        // Change 7: English-only
                        classname: getClassName(cl, lang) || String(r.classid),
                        sectionname: getSectionName(sec, lang) || String(r.sectionid),
                        subjectName: getSubjectName(sub, lang),
                        divisionname: getDivisionName(div, lang),
                        curriculumname: getCurriculumName(cur, lang),
                        stuCount,
                        examCount,
                    };
                });
                setAllSections(sections);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, [user]);

    if (selected) return <ClassDetail section={selected} onBack={() => setSelected(null)} user={user} />;

    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('myClasses', lang)}</h1>
                <p className="text-[#64748b] text-sm">{t('selectAClass', lang)}</p>
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-20 text-[#94a3b8]"><Loader2 className="h-7 w-7 animate-spin mr-2" /> Loading...</div>
            ) : allSections.length === 0 ? (
                <div className="text-center py-20 text-[#94a3b8]">{t('noData', lang)}</div>
            ) : (
                <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
                    <div className="p-5 border-b border-[#e2e8f0] bg-slate-50 flex items-center gap-3">
                        <Book className="h-5 w-5 text-[#1d4ed8]" />
                        <h2 className="text-base font-bold text-[#0f172a]">{t('myAssignedClasses', lang)}</h2>
                        <span className="ml-auto text-xs text-[#94a3b8]">
                            {mySections.length < allSections.length ? `${mySections.length} / ` : ''}{allSections.length} {t('classes', lang)}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[800px]">
                            <thead className="bg-slate-50 border-b border-[#e2e8f0]">
                                <tr>
                                    <SortableTh col="classname"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filterValue={colFilters.classname}     onFilter={v => setColFilter('classname',     v)}>{t('classes', lang)}</SortableTh>
                                    <SortableTh col="sectionname"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filterValue={colFilters.sectionname}   onFilter={v => setColFilter('sectionname',   v)}>{t('section', lang)}</SortableTh>
                                    <SortableTh col="subjectName"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filterValue={colFilters.subjectName}   onFilter={v => setColFilter('subjectName',   v)}>{t('subject', lang)}</SortableTh>
                                    <SortableTh col="curriculumname" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filterValue={colFilters.curriculumname} onFilter={v => setColFilter('curriculumname', v)}>{t('curriculum', lang)}</SortableTh>
                                    <SortableTh col="divisionname"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filterValue={colFilters.divisionname}  onFilter={v => setColFilter('divisionname',  v)}>{t('division', lang)}</SortableTh>
                                    <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider">{t('examCount', lang) || 'Exams'}</th>
                                    <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider">{t('students', lang)}</th>
                                    <th className="py-4 px-5"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e2e8f0]">
                                {sorted.map((cls, idx) => (
                                    <motion.tr key={`${cls.classid}-${cls.sectionid}-${cls.subjectid}`}
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.04 }}
                                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => setSelected(cls)}>
                                        <td className="py-4 px-5 text-sm font-bold text-[#0f172a]">{cls.classname}</td>
                                        <td className="py-4 px-5">
                                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-xs font-bold border border-blue-100">{cls.sectionname}</span>
                                        </td>
                                        <td className="py-4 px-5 text-sm text-[#475569] font-medium">{cls.subjectName}</td>
                                        <td className="py-4 px-5">
                                            {cls.curriculumname
                                                ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">{cls.curriculumname}</span>
                                                : <span className="text-xs text-[#94a3b8]">—</span>}
                                        </td>
                                        {/* Change 5: New Division column */}
                                        <td className="py-4 px-5 text-xs text-[#64748b] font-medium">{cls.divisionname || '—'}</td>
                                        <td className="py-4 px-5">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-blue-50 text-blue-700 border-blue-200">
                                                <ClipboardList className="h-3 w-3" />
                                                {cls.examCount} {t('exams', lang)}
                                            </span>
                                        </td>
                                        <td className="py-4 px-5">
                                            <span className="flex items-center gap-1.5 text-sm text-[#64748b]">
                                                <Users className="h-4 w-4" /> {cls.stuCount}
                                            </span>
                                        </td>
                                        <td className="py-4 px-5">
                                            <button className="text-xs font-bold text-[#1d4ed8] bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">
                                                {t('view', lang)} →
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function ClassDetail({ section, onBack, user }) {
    const { lang } = useLang();
    const [tab, setTab] = useState('students');
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const stuScRows = await rest('students_sections_classes_tbl', {
                    classid: `eq.${section.classid}`, sectionid: `eq.${section.sectionid}`,
                    schoolid: `eq.${user.schoolid}`, select: 'studentid'
                });
                const stuIds = stuScRows.map(r => r.studentid);
                if (stuIds.length === 0) { setStudents([]); setLoading(false); return; }
                const stuList = await rest('students_tbl', { studentid: `in.(${stuIds})`, select: '*' });
                setStudents(stuList);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, [section, user]);

    return (
        <div className="space-y-6 pb-12">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="h-9 w-9 rounded-full flex items-center justify-center border border-[#e2e8f0] hover:bg-slate-100 transition-all cursor-pointer">
                    <ChevronLeft className="h-5 w-5 text-[#475569]" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
                        {section.classname}
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-sm font-bold border border-blue-100">{t('section', lang)} {section.sectionname}</span>
                    </h1>
                    <p className="text-[#64748b] text-sm">{students.length} {t('students', lang)} · {section.subjectName}</p>
                </div>
            </div>

            <div className="flex border-b border-[#e2e8f0] gap-1">
                {[{ id: 'students', label: t('studentsTable', lang) }, { id: 'marks', label: t('previousMarks', lang) }].map(tab_ => (
                    <button key={tab_.id} onClick={() => setTab(tab_.id)}
                        className={`px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${tab === tab_.id ? 'border-[#1d4ed8] text-[#1d4ed8]' : 'border-transparent text-[#64748b] hover:text-[#0f172a]'}`}>
                        {tab_.label}
                    </button>
                ))}
            </div>

            {tab === 'students' && <StudentsTab students={students} loading={loading} />}
            {tab === 'marks' && <MarksTab section={section} user={user} students={students} />}
        </div>
    );
}

function StudentsTab({ students, loading }) {
    const { lang } = useLang();
    const [sortCol, setSortCol] = useState('studentid');
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };
    const arrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    const sorted = [...students].sort((a, b) => {
        const av = sortCol === 'studentid' ? Number(a.studentid) : Number(a.studentid);
        const bv = sortCol === 'studentid' ? Number(b.studentid) : Number(b.studentid);
        return sortDir === 'asc' ? av - bv : bv - av;
    });

    if (loading) return <div className="flex items-center justify-center py-16 text-[#94a3b8]"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...</div>;
    if (students.length === 0) return <div className="text-center py-16 text-[#94a3b8]">{t('noStudentsEnrolled', lang)}</div>;
    return (
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[640px]">
                    <thead className="bg-slate-50 border-b border-[#e2e8f0]">
                        <tr>
                            <th className="py-4 px-6 text-xs font-black text-[#64748b] uppercase tracking-wider">#</th>
                            <th onClick={() => handleSort('studentid')} className="py-4 px-6 text-xs font-black text-[#64748b] uppercase tracking-wider cursor-pointer select-none hover:text-[#1d4ed8]">
                                ID{arrow('studentid')}
                            </th>
                            <th className="py-4 px-6 text-xs font-black text-[#64748b] uppercase tracking-wider">{t('name', lang)}</th>
                            <th className="py-4 px-6 text-xs font-black text-[#64748b] uppercase tracking-wider">{t('email', lang)}</th>
                            <th className="py-4 px-6 text-xs font-black text-[#64748b] uppercase tracking-wider">{t('mobile', lang)}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                        {sorted.map((s, i) => (
                            <tr key={s.studentid} className="hover:bg-slate-50">
                                <td className="py-3 px-6 text-sm text-[#94a3b8]">{i + 1}</td>
                                <td className="py-3 px-6 text-xs font-mono font-bold text-[#94a3b8]">#{s.studentid}</td>
                                <td className="py-3 px-6 text-sm font-bold text-[#0f172a]">{getStudentFullName(s, lang)}</td>
                                <td className="py-3 px-6 text-sm text-[#64748b]">{s.studentemail || '—'}</td>
                                <td className="py-3 px-6 text-sm text-[#64748b]">{s.studentmobile || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Change 8: Previous Marks redesign with question_marks, new grading scale
function MarksTab({ section, user, students }) {
    const { lang } = useLang();
    const [exams, setExams] = useState([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [marks, setMarks] = useState([]);
    const [questions, setQuestions] = useState([]); // [{questionid, question_marks}]
    const [loading, setLoading] = useState(false);
    const [grades, setGrades] = useState([]);
    const [sortCol, setSortCol] = useState('totalMark');
    const [sortDir, setSortDir] = useState('desc');
    const handleMarkSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir(col === 'totalMark' || col === 'pct' ? 'desc' : 'asc'); }
    };
    const sortArrow = (col) => sortCol === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ⇅';

    useEffect(() => {
        (async () => {
            const [stuExams, examTbl] = await Promise.all([
                rest('students_exams_employees_section_subjects_classes_semisters_cur', {
                    employeeid: `eq.${user.employeeid}`, classid: `eq.${section.classid}`,
                    sectionid: `eq.${section.sectionid}`, select: 'examid',
                }),
                rest('exams_tbl', { select: '*' }),
            ]);
            const seen = new Set();
            const unique = stuExams.filter(r => { if (seen.has(r.examid)) return false; seen.add(r.examid); return true; });
            const exOpts = unique.map(r => ({
                examid: r.examid,
                name: getField(examTbl.find(e => e.examid === r.examid), 'examname', 'examname_en', lang) || `${t('exam', lang)} ${r.examid}`,
            }));
            setExams(exOpts);
            if (exOpts.length === 1) {
                setPendingExam(String(exOpts[0].examid));
                loadMarks(String(exOpts[0].examid));
            }
        })();
    }, [section, user]);


    useEffect(() => { loadGrades().then(setGrades); }, []);
    const [pendingExam, setPendingExam] = useState('');

    const loadMarks = async (examid) => {
        if (!examid) return;
        setSelectedExam(examid);
        setLoading(true);
        try {
            const [answers, qs] = await Promise.all([
                rest('studentanswers_tbl', {
                    examid: `eq.${examid}`, employeeid: `eq.${user.employeeid}`,
                    classid: `eq.${section.classid}`, sectionid: `eq.${section.sectionid}`,
                    select: 'studentid,studentmark,questionid',
                }),
                // Change 8: fetch question_marks field
                rest('questions_exams_employee_subjects_sections_tbl', {
                    examid: `eq.${examid}`, employeeid: `eq.${user.employeeid}`,
                    classid: `eq.${section.classid}`, sectionid: `eq.${section.sectionid}`,
                    select: 'questionid,question_marks',
                }).catch(() => []),
            ]);

            // Sort questions ascending by questionid (Change 9)
            const sortedQs = [...(qs || [])].sort((a, b) => a.questionid - b.questionid);
            setQuestions(sortedQs);

            // Total possible marks = sum of all question_marks
            const totalPossible = sortedQs.reduce((sum, q) => sum + (parseFloat(q.question_marks) || 1), 0);

            // Group answers by student
            const answersByStudent = {};
            answers.forEach(a => {
                if (!answersByStudent[a.studentid]) answersByStudent[a.studentid] = {};
                answersByStudent[a.studentid][a.questionid] = parseFloat(a.studentmark) || 0;
            });

            // Build student mark rows
            setMarks(students.map(s => {
                const stuAnswers = answersByStudent[s.studentid] || {};
                // Total mark = sum of student answers for this exam
                const totalMark = sortedQs.reduce((sum, q) => sum + (stuAnswers[q.questionid] || 0), 0);
                const pct = totalPossible > 0 ? (totalMark / totalPossible) * 100 : null;
                return {
                    ...s,
                    fullName: getStudentFullName(s, lang),
                    totalMark,
                    totalPossible,
                    pct,
                    // Change 8: per-question marks for display
                    questionMarks: sortedQs.map(q => ({
                        questionid: q.questionid,
                        maxMark: parseFloat(q.question_marks) || 1,
                        earned: stuAnswers[q.questionid] || 0,
                    })),
                };
            }));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const totalPossible = questions.reduce((sum, q) => sum + (parseFloat(q.question_marks) || 1), 0);
    // Change 2: compute avg as percentage only
    const avgPct = marks.length && totalPossible > 0
        ? (marks.reduce((a, s) => a + (s.pct || 0), 0) / marks.length).toFixed(1)
        : 0;

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
                <label className="block text-xs font-bold text-[#64748b] mb-1.5 uppercase tracking-wide">{t('selectExam', lang)}</label>
                <div className="flex items-center gap-3">
                    <select className="input-field h-10 w-64" value={pendingExam} onChange={e => setPendingExam(e.target.value)}>
                        <option value="">{t('chooseExam', lang)}</option>
                        {exams.map(e => <option key={e.examid} value={e.examid}>{e.name}</option>)}
                    </select>
                    <button
                        onClick={() => loadMarks(pendingExam)}
                        disabled={!pendingExam || loading}
                        className="h-10 px-5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-sm font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 transition-all"
                    >
                        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('loading', lang)}</> : <>{t('applyFilters', lang)}</>}
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-10 text-[#94a3b8]">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading marks...
                </div>
            )}

            {!loading && selectedExam && marks.length > 0 && (
                <>
                    {/* Change 2: 3 summary cards only — removed Pass Rate card */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 text-center">
                            <p className="text-xs text-[#64748b] font-medium mb-1">{t('totalMarks', lang)}</p>
                            <p className="text-2xl font-black text-[#0f172a]">{totalPossible}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 text-center">
                            <p className="text-xs text-[#64748b] font-medium mb-1">{t('students', lang)}</p>
                            <p className="text-2xl font-black text-[#0f172a]">{marks.length}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 text-center">
                            <p className="text-xs text-[#64748b] font-medium mb-1">{t('classAverage', lang)}</p>
                            <p className="text-2xl font-black text-[#1d4ed8]">{avgPct}%</p>
                        </div>
                    </div>

                    {/* Detailed table */}
                    <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#e2e8f0] bg-slate-50 flex items-center justify-between">
                            <span className="text-xs text-[#94a3b8]">{t('totalMarks', lang)}: {totalPossible} · {marks.length} {t('students', lang)}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[640px]">
                                <thead className="bg-slate-50 border-b border-[#e2e8f0]">
                                    <tr>
                                        <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider">ID</th>
                                        <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider cursor-pointer select-none" onClick={() => handleMarkSort('fullName')}>
                                            {t('name', lang)}<span className="text-[#1d4ed8] ml-1">{sortArrow('fullName')}</span>
                                        </th>
                                        <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider text-center cursor-pointer select-none" onClick={() => handleMarkSort('totalMark')}>
                                            {t('mark', lang)}<span className="text-[#1d4ed8] ml-1">{sortArrow('totalMark')}</span>
                                        </th>
                                        <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider text-center cursor-pointer select-none" onClick={() => handleMarkSort('pct')}>
                                            {t('percentage', lang)}<span className="text-[#1d4ed8] ml-1">{sortArrow('pct')}</span>
                                        </th>
                                        <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider text-center">{t('grade', lang)}</th>
                                        <th className="py-4 px-5 text-xs font-black text-[#64748b] uppercase tracking-wider text-center">{t('status', lang)}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e2e8f0]">
                                    {[...marks]
                                        .sort((a, b) => {
                                            let av = a[sortCol] ?? 0;
                                            let bv = b[sortCol] ?? 0;
                                            if (sortCol === 'fullName') {
                                                av = String(a.fullName || '').toLowerCase();
                                                bv = String(b.fullName || '').toLowerCase();
                                                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
                                            }
                                            return sortDir === 'asc' ? av - bv : bv - av;
                                        })
                                        .map((s, i) => {
                                            const grade = calcGradeFromList(s.pct, grades);
                                            return (
                                                <motion.tr key={s.studentid}
                                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                                                    className="hover:bg-slate-50 transition-colors">
                                                    <td className="py-3.5 px-5 text-xs font-mono font-bold text-[#94a3b8]">#{s.studentid}</td>
                                                    <td className="py-3.5 px-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs flex-shrink-0">
                                                                {s.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                            </div>
                                                            <span className="text-sm font-bold text-[#0f172a]">{s.fullName}</span>
                                                        </div>
                                                    </td>
                                                    {/* Change 8: Mark format "earned / total" */}
                                                    <td className="py-3.5 px-5 text-center">
                                                        <span className="text-base font-black text-[#1d4ed8]">
                                                            {s.totalMark} / {totalPossible}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-5 text-center">
                                                        {s.pct !== null ? (
                                                            <div className="flex items-center justify-center gap-2">
                                                                <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${s.pct >= 50 ? 'bg-blue-500' : 'bg-red-400'}`}
                                                                        style={{ width: `${Math.min(s.pct, 100)}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-sm font-bold text-[#64748b]">{s.pct.toFixed(1)}%</span>
                                                            </div>
                                                        ) : <span className="text-[#94a3b8]">—</span>}
                                                    </td>
                                                    <td className="py-3.5 px-5 text-center">
                                                        {grade.label !== '—'
                                                            ? <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-bold border ${grade.color}`}>{grade.label}</span>
                                                            : <span className="text-[#94a3b8]">—</span>}
                                                    </td>
                                                    {/* Change 8: Pass/Fail status */}
                                                    <td className="py-3.5 px-5 text-center">
                                                        {s.pct !== null ? (
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${grade.pass ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                                {grade.pass ? t('pass', lang) : t('fail', lang)}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
            {!loading && selectedExam && marks.length === 0 && (
                <div className="text-center py-12 text-[#94a3b8]">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t('noData', lang)}</p>
                </div>
            )}
        </div>
    );
}