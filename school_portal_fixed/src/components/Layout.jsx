import { useState } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './Header';
import Sidebar from './Sidebar';
import { useLang } from '../context/LanguageContext';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Home } from 'lucide-react';
import { t } from '../lib/langHelper';

export default function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { isAr, lang } = useLang();

    const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
    const closeSidebar = () => setIsSidebarOpen(false);

    // Breadcrumb logic
    const pathnames = location.pathname.split('/').filter(x => x);
    const isHome = pathnames.length === 0;

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            <Header toggleSidebar={toggleSidebar} isOpen={isSidebarOpen} />

            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

            {/* Mobile backdrop — only shown on small screens when sidebar is open */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden top-16"
                    onClick={closeSidebar}
                />
            )}

            {/*
              Desktop: sidebar is always visible as an icon rail (64px) that expands to 240px.
              Mobile: sidebar overlays content (z-40), main takes full width.
            */}
            <main
                className={`
                    flex-1 pt-16 transition-all duration-300 overflow-x-hidden
                    ${isAr ? 'mr-0 sm:mr-16' : 'ml-0 sm:ml-16'}
                    ${isSidebarOpen ? (isAr ? 'lg:mr-60' : 'lg:ml-60') : ''}
                `}
            >
                <div className="p-4 sm:p-6 h-full">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -16 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="h-full space-y-4"
                        >
                            {/* Breadcrumbs & Back Button */}
                            {!isHome && (
                                <div className={`flex items-center justify-between flex-wrap gap-4 mb-2`}>
                                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                        <button
                                            onClick={() => navigate(-1)}
                                            className="p-2 bg-white border border-[#e2e8f0] rounded-lg text-[#64748b] hover:text-[#1d4ed8] hover:border-[#1d4ed8] transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold"
                                        >
                                            <ArrowLeft className={`h-3.5 w-3.5 ${isAr ? 'rotate-180' : ''}`} />
                                            {t('back', lang) || 'Back'}
                                        </button>

                                        <div className="h-6 w-px bg-[#e2e8f0] mx-1 hidden sm:block"></div>

                                        <nav className="flex items-center text-xs font-medium text-[#94a3b8]">
                                            <Link to="/" className="hover:text-[#1d4ed8] transition-colors flex items-center gap-1">
                                                <Home className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">{t('home', lang) || 'Home'}</span>
                                            </Link>
                                            {pathnames.map((value, index) => {
                                                const last = index === pathnames.length - 1;
                                                const to = `/${pathnames.slice(0, index + 1).join('/')}`;
                                                // Don't show numeric IDs in breadcrumbs if possible, or beautify them
                                                const label = isNaN(value) ? t(value.toLowerCase(), lang) || value.charAt(0).toUpperCase() + value.slice(1) : `#${value}`;

                                                return (
                                                    <div key={to} className="flex items-center capitalize">
                                                        <ChevronRight className={`h-3 w-3 mx-1.5 flex-shrink-0 ${isAr ? 'rotate-180' : ''}`} />
                                                        {last ? (
                                                            <span className="text-[#0f172a] font-bold">{label}</span>
                                                        ) : (
                                                            <Link to={to} className="hover:text-[#1d4ed8] transition-colors whitespace-nowrap">
                                                                {label}
                                                            </Link>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </nav>
                                    </div>
                                </div>
                            )}
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
