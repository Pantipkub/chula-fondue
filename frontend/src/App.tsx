import { Analytics } from './pages/analytics';
import { Notifications } from './pages/notifications';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui';
import { PublicLayout, RequireRole } from './components/layouts';
import { Landing, Login, Register, Track } from './pages/public';
import { MyTickets, ReportDone, ReportForm, TicketDetail } from './pages/reporter';
import { AdminFrame, Departments, Inbox, Review, Users } from './pages/admin';
import { Queue, StaffFrame, Work } from './pages/staff';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ScrollTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<PublicLayout />}>
              <Route index element={<Landing />} />
              <Route path="/report" element={<ReportForm />} />
              <Route path="/report/done/:id" element={<ReportDone />} />
              <Route path="/track" element={<Track />} />
              <Route path="/track/:id" element={<Track />} />
              <Route path="/notifications" element={<RequireRole roles={['REPORTER', 'ADMIN', 'STAFF']}><Notifications /></RequireRole>} />
              <Route path="/my" element={<RequireRole roles={['REPORTER']}><MyTickets /></RequireRole>} />
              <Route path="/tickets/:id" element={<RequireRole roles={['REPORTER']}><TicketDetail /></RequireRole>} />
            </Route>
            <Route path="/admin" element={<RequireRole roles={['ADMIN']}><AdminFrame /></RequireRole>}>
              <Route index element={<Inbox />} />
              <Route path="tickets/:id" element={<Review />} />
              <Route path="departments" element={<Departments />} />
              <Route path="users" element={<Users />} />
              <Route path="analytics" element={<Analytics />} />
            </Route>
            <Route path="/staff" element={<RequireRole roles={['STAFF']}><StaffFrame /></RequireRole>}>
              <Route index element={<Queue />} />
              <Route path="tickets/:id" element={<Work />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
