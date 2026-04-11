import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, rest } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [firstLogin, setFirstLogin] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session) await loadEmployee(session.user);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) await loadEmployee(session.user);
            else { setUser(null); setFirstLogin(false); }
        });

        return () => subscription.unsubscribe();
    }, []);

    const loadEmployee = async (authUser) => {
        try {
            const employees = await rest('employee_tbl', { auth_user_id: `eq.${authUser.id}`, select: '*' });
            if (!employees.length) return;
            const emp = employees[0];
            const types = await rest('employees_types_tbl', { employeeid: `eq.${emp.employeeid}`, select: 'typeid' });
            const typeid = types[0]?.typeid;
            const roleMap = { 1: 'Teacher', 2: 'Supervisor', 3: 'GM', 6: 'Admin' };
            const role = roleMap[typeid] || 'Teacher';
            let schoolName = '', branchName = '';
            try {
                const schools = await rest('schools_tbl', { schoolid: `eq.${emp.schoolid}`, select: 'schoolname_en,schoolname' });
                schoolName = schools[0]?.schoolname_en || schools[0]?.schoolname || '';
                const branches = await rest('branches_tbl', { branchid: `eq.${emp.branchid}`, schoolid: `eq.${emp.schoolid}`, select: 'branchname_en,branchname' });
                branchName = branches[0]?.branchname_en || branches[0]?.branchname || '';
            } catch {}
            setFirstLogin(emp.first_login === true);
            // Change 1: always use English name (employeename_en), fallback to employeename
            const displayName = emp.employeename_en || emp.employeename || '';
            setUser({ id: authUser.id, employeeid: emp.employeeid, name: displayName, email: emp.employeeemail, subtitle: role, role, typeid, schoolid: emp.schoolid, branchid: emp.branchid, schoolName, branchName, first_login: emp.first_login });
        } catch (e) { console.error('loadEmployee error:', e); }
    };

    const login = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setFirstLogin(false);
    };

    const changePassword = async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcnJiYXpsZWhhbW9vZ2dzb3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTE3ODEsImV4cCI6MjA4ODA2Nzc4MX0.o2hqPzmPDZvPAKyC2bCzVfBKI21cP1ZB78OIWRociow";
        await fetch(`https://odrrbazlehamooggsouv.supabase.co/rest/v1/employee_tbl?employeeid=eq.${user.employeeid}`, {
            method: 'PATCH',
            headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_login: false }),
        });
        setFirstLogin(false);
        setUser(u => ({ ...u, first_login: false }));
    };

    return (
        <AuthContext.Provider value={{ user, loading, firstLogin, login, logout, changePassword }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
