import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import { AdminProvider } from './components/AdminContext'
import { ToastProvider } from './components/Toast'
import Dashboard from './pages/Dashboard'
import OrdersReportPage from './pages/OrdersReportPage'
import Login from './pages/Login'
import MenuManager from './pages/MenuManager'
import MenuImages from './pages/MenuImages'
import MenuBulkEdit from './pages/MenuBulkEdit'
import CategoryForm from './pages/CategoryForm'
import ProductForm from './pages/ProductForm'
import AdditionalsManager from './pages/AdditionalsManager'
import CategoryEdit from './pages/CategoryEdit'
import ProductEdit from './pages/ProductEdit'
import Drivers from './pages/Drivers'
import PublicMenu from './pages/PublicMenu'
import Kitchen from './pages/Kitchen'
import OrderTracking from './pages/OrderTracking'
import OrderPrint from './pages/OrderPrint'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <ToastProvider>
          <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Dashboard />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/orders"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <OrdersReportPage />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <MenuManager />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/category/new"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <CategoryForm />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/category/:id/edit"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <CategoryEdit />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/item/new"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <ProductForm />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/item/:id/edit"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <ProductEdit />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/images"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <MenuImages />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/bulk"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <MenuBulkEdit />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu/additionals"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdditionalsManager />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/deliveries/drivers"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Drivers />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Kitchen />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Settings />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route path="/pedido/:token" element={<OrderTracking />} />
          <Route path="/order/:id/print" element={<OrderPrint />} />
          <Route path="/r/:slug" element={<PublicMenu />} />
          </Routes>
        </ToastProvider>
      </AdminProvider>
    </BrowserRouter>
  )
}
