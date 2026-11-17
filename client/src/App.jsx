// CampusFlow OS — router. Role-protected portals: /student/*, /recruiter/*, /admin/*.
// Any unknown route sends you home for your role.

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import Drives from './pages/student/Drives.jsx';
import DriveDetail from './pages/student/DriveDetail.jsx';
import MyBookings from './pages/student/MyBookings.jsx';
import StudentProfile from './pages/student/StudentProfile.jsx';
import StudentJourney from './pages/student/StudentJourney.jsx';
import TestTaker from './pages/student/TestTaker.jsx';
import RecruiterDashboard from './pages/recruiter/RecruiterDashboard.jsx';
import RecruiterInbox from './pages/recruiter/RecruiterInbox.jsx';
import MyDrives from './pages/recruiter/MyDrives.jsx';
import RecruiterDriveDetail from './pages/recruiter/RecruiterDriveDetail.jsx';
import OfferLetter from './pages/recruiter/OfferLetter.jsx';
import NewDriveWizard from './pages/recruiter/NewDriveWizard.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import KernelMonitor from './pages/admin/KernelMonitor.jsx';
import SchedulingLab from './pages/admin/SchedulingLab.jsx';
import Resources from './pages/admin/Resources.jsx';
import ResourceCalendar from './pages/admin/ResourceCalendar.jsx';
import AuditLog from './pages/admin/AuditLog.jsx';
import Reports from './pages/admin/Reports.jsx';
import Users from './pages/admin/Users.jsx';
import ExamMonitoring from './pages/admin/ExamMonitoring.jsx';
import ExamPcs from './pages/admin/ExamPcs.jsx';

const HOME = { admin: '/admin', recruiter: '/recruiter', student: '/student' };

function ProtectedRoute({ role, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={HOME[user.role] ?? '/student'} replace />;
  return children;
}

function RoleRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Loading…</div>;
  return <Navigate to={user ? HOME[user.role] ?? '/student' : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/student" element={<ProtectedRoute role="student"><Layout /></ProtectedRoute>}>
        <Route index element={<StudentDashboard />} />
        <Route path="drives" element={<Drives />} />
        <Route path="drives/:id" element={<DriveDetail />} />
        <Route path="tests/:driveId" element={<TestTaker />} />
        <Route path="bookings" element={<MyBookings />} />
        <Route path="profile" element={<StudentProfile />} />
        <Route path="journey" element={<StudentJourney />} />
      </Route>

      <Route path="/recruiter" element={<ProtectedRoute role="recruiter"><Layout /></ProtectedRoute>}>
        <Route index element={<RecruiterDashboard />} />
        <Route path="drives" element={<MyDrives />} />
        <Route path="drives/new" element={<NewDriveWizard />} />
        <Route path="drives/:id" element={<RecruiterDriveDetail />} />
        <Route path="offers/:id" element={<OfferLetter />} />
        <Route path="inbox" element={<RecruiterInbox />} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="monitor" element={<KernelMonitor />} />
        <Route path="scheduling" element={<SchedulingLab />} />
        <Route path="resources" element={<Resources />} />
        <Route path="calendar" element={<ResourceCalendar />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="monitoring" element={<ExamMonitoring />} />
        <Route path="exam-pcs" element={<ExamPcs />} />
      </Route>

      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  );
}
