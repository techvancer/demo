import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { rest } from '../../lib/supabaseClient';
import { useToast } from '../../context/ToastContext';

export default function SupervisorReports() {
    const { lang, isAr } = useLang();

    const { user } = useAuth();
    const { addToast } = useToast();
    const [enrollmentData, setEnrollmentData] = useState([]);
    const [subjectData, setSubjectData] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const [clRows, clTbl, secRows, stuScRows, subClRows, subRows] = await Promise.all([
                rest('sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('classes_tbl', { select: '*' }),
                rest('sections_tbl', { select: '*' }),
                rest('students_sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('sections_subjects_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('subjects_tbl', { select: '*' }),
            ]);
            const enroll = clRows.map(sc => {
                const cl = clTbl.find(c => c.classid === sc.classid);
                const sec = secRows.find(s => s.sectionid === sc.sectionid);
                const count = stuScRows.filter(s => s.classid === sc.classid && s.sectionid === sc.sectionid).length;
                return { name: `${t('class', lang)} ${getField(cl, 'classname', 'classname_en', lang) || cl?.classname}-${getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || '?'}`, students: count };
            });
            setEnrollmentData(enroll);
            const subjects = clRows.map(sc => {
                const cl = clTbl.find(c => c.classid === sc.classid);
                const sec = secRows.find(s => s.sectionid === sc.sectionid);
                const count = subClRows.filter(s => s.classid === sc.classid && s.sectionid === sc.sectionid).length;
                return { name: `${t('class', lang)} ${getField(cl, 'classname', 'classname_en', lang) || cl?.classname}-${getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname || '?'}`, subjects: count };
            });
            setSubjectData(subjects);
        } catch (e) { addToast(e.message, 'error'); }
        finally { setLoading(false); }
    }, [user]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const ChartCard = ({ title, subtitle, data, dataKey, color, empty }) => (
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
            <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-[#0f172a]">{title}</h3>
            </div>
            <p className="text-xs text-[#94a3b8] mb-6">{subtitle}</p>
            {loading ? <div className="h-[260px] flex items-center justify-center text-[#94a3b8]">{t('loading', lang)}</div>
            : data.length === 0 ? <div className="h-[260px] flex items-center justify-center text-[#94a3b8] text-sm">{t(empty, lang)}</div>
            : (
                <div style={{height:'260px'}}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                            <Bar dataKey={dataKey} fill={color} radius={[4,4,0,0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('reports', lang)}</h1>
                <p className="text-[#64748b] text-sm">{t('reportsDesc', lang)}</p>
            </div>
            <ChartCard title={t('studentEnrollmentByClass', lang)} subtitle={t('enrollmentSubtitle', lang)} data={enrollmentData} dataKey="students" color="#1d4ed8" empty="noEnrollmentData" />
            <ChartCard title={t('subjectsAssignedPerClass', lang)} subtitle={t('subjectsSubtitle', lang)} data={subjectData} dataKey="subjects" color="#16a34a" empty="noSubjectAssignments" />
        </div>
    );
}
