import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileBottomNav from '../navigation/MobileBottomNav';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../hooks/useToast';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { ToastContainer } = useToast();

  return (
    <div className="app flex flex-col min-h-screen">
      <Header user={user} onLogout={logout} />
      <main className="main flex flex-1 flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-6 w-full max-w-[1600px] mx-auto">
        <Sidebar />
        <div className="content flex-1 flex flex-col gap-8 min-w-0">
          <Outlet />
        </div>
      </main>
      <MobileBottomNav />
      <ToastContainer />
    </div>
  );
}
