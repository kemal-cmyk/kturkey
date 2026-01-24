import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import SiteWizard from './pages/SiteWizard';
import Units from './pages/Units';
import Residents from './pages/Residents';
import FiscalPeriods from './pages/FiscalPeriods';
import Budget from './pages/Budget';
import Ledger from './pages/Ledger';
import ImportLedger from './pages/ImportLedger';
import DebtTracking from './pages/DebtTracking';
import Reports from './pages/Reports';
import BudgetVsActual from './pages/BudgetVsActual';
import MonthlyIncomeExpenses from './pages/MonthlyIncomeExpenses';
import Tickets from './pages/Tickets';
import Settings from './pages/Settings';
import MyAccount from './pages/MyAccount';
import { Loader2 } from 'lucide-react';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/sites/new"
        element={
          <PrivateRoute>
            <SiteWizard />
          </PrivateRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/units"
        element={
          <PrivateRoute>
            <Layout>
              <Units />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/residents"
        element={
          <PrivateRoute>
            <Layout>
              <Residents />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/fiscal-periods"
        element={
          <PrivateRoute>
            <Layout>
              <FiscalPeriods />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/budget"
        element={
          <PrivateRoute>
            <Layout>
              <Budget />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/ledger"
        element={
          <PrivateRoute>
            <Layout>
              <Ledger />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/ledger/import"
        element={
          <PrivateRoute>
            <Layout>
              <ImportLedger />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/debt-tracking"
        element={
          <PrivateRoute>
            <Layout>
              <DebtTracking />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <Layout>
              <Reports />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/budget-vs-actual"
        element={
          <PrivateRoute>
            <Layout>
              <BudgetVsActual />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/monthly-income-expenses"
        element={
          <PrivateRoute>
            <Layout>
              <MonthlyIncomeExpenses />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <PrivateRoute>
            <Layout>
              <Tickets />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Layout>
              <Settings />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/my-account"
        element={
          <PrivateRoute>
            <Layout>
              <MyAccount />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
