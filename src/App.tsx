import React, { useState, useEffect, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import logoImage from './logo.jpg';
import { 
  Home, 
  MapPin, 
  Utensils, 
  ShoppingBag, 
  Briefcase, 
  Search, 
  Plus,
  User,
  LogOut,
  Heart,
  Image as ImageIcon, 
  Star, 
  Phone, 
  Info,
  ChevronRight,
  Filter,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  Check,
  X,
  CreditCard,
  Settings,
  LayoutDashboard,
  Users,
  BarChart3,
  PieChart,
  Activity,
  Bell,
  CheckSquare,
  Clock,
  Trash2,
  Edit,
  Moon,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

declare global {
  interface Window {
    Razorpay: any;
  }
}
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  getDoc, 
  getDocs,
  updateDoc,
  orderBy,
  deleteDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface UserData {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: string;
}

interface Hostel {
  id: string;
  name: string;
  address: string;
  price: number;
  amenities: string[];
  rating: number;
  imageUrl: string;
  images: string[];
  contact: string;
  availableRooms: number;
  roomType: 'Single' | 'Double' | 'Triple' | 'Sharing';
  isAC: boolean;
  reviews?: Review[];
  ownerId?: string;
  createdAt?: string;
  status?: ApprovalStatus;
  rejectionReason?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  listingFeePaid?: boolean;
  razorpayAccountId?: string;
}

interface Payment {
  id: string;
  userId: string;
  hostelId: string;
  hostelName: string;
  amount: number;
  status: 'Success' | 'Pending' | 'Failed';
  createdAt: string;
}

interface TiffinService {
  id: string;
  name: string;
  description: string;
  pricePerMeal: number;
  subscriptionPlans: {
    weekly: number;
    monthly: number;
  };
  fullMenu: { day: string; items: string[] }[]; // Weekly menu
  imageUrl: string;
  contact: string;
  rating: number;
  reviews: Review[];
  ownerId?: string;
  createdAt?: string;
  status?: ApprovalStatus;
  rejectionReason?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  listingFeePaid?: boolean;
  razorpayAccountId?: string;
}

interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface MarketItem {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  createdAt: string;
  availability: 'Available' | 'Sold';
  status?: ApprovalStatus;
  rejectionReason?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  listingFeePaid?: boolean;
  razorpayAccountId?: string;
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: 'Part-time' | 'Full-time' | 'Internship';
  description: string;
  createdAt: string;
  contact: string;
  lastDate: string;
  eligibility: string;
  postedBy?: string;
  status?: ApprovalStatus;
  rejectionReason?: string;
  listingFeePaid?: boolean;
}

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
  read: boolean;
  link?: string;
}

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// --- Helper Functions ---
const getOrCreateRazorpayAccount = async (item: any, type: 'hostel' | 'tiffin' | 'market', user: any) => {
  if (item.razorpayAccountId) return item.razorpayAccountId;

  if (!item.bankAccountNumber || !item.ifscCode) {
    throw new Error('Vendor bank details are missing. Payout cannot be processed.');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/payment/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name || item.title || user.displayName || 'Vendor',
        email: user.email || 'vendor@example.com',
        bank_account: item.bankAccountNumber,
        ifsc_code: item.ifscCode
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Razorpay Account Creation Failed:', errorData);
      throw new Error('Failed to create Razorpay linked account: ' + (errorData.error || 'Unknown error'));
    }
    const account = await response.json();
    
    // Update Firestore with the new account ID (skip for mock items)
    const isMockId = (id: string) => !id || id.startsWith('mock') || /^\d+$/.test(id);
    if (!isMockId(item.id)) {
      const collectionName = type === 'hostel' ? 'hostels' : type === 'tiffin' ? 'tiffinServices' : 'marketItems';
      try {
        await updateDoc(doc(db, collectionName, item.id), {
          razorpayAccountId: account.id
        });
      } catch (err) {
        console.warn(`Could not update Firestore for ${type} ${item.id}:`, err);
      }
    }

    return account.id;
  } catch (err) {
    console.error('Error creating Razorpay account:', err);
    throw err;
  }
};

const sendNotification = async (userId: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', link?: string) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      createdAt: new Date().toISOString(),
      read: false,
      link: link || ''
    });
  } catch (err) {
    console.error('Error sending notification:', err);
  }
};

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} (${parsedError.operationType} on ${parsedError.path})`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-800 px-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 p-12 rounded-[3rem] shadow-2xl text-center border border-gray-100 dark:border-slate-800">
            <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-10">
              <AlertCircle size={40} />
            </div>
            <h1 className="text-2xl font-bold mb-4">Application Error</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Navbar = ({ user, onLogout, isAdmin, theme, setTheme }: { user: FirebaseUser | null, onLogout: () => void, isAdmin: boolean, theme: 'light' | 'dark', setTheme: (t: 'light' | 'dark') => void }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', isAdmin ? 'ADMIN' : user.uid), where('read', '==', false));
    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });
    return () => unsub();
  }, [user, isAdmin]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 h-16 flex items-center px-4 md:px-8">
      <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-2">
          <div className="w-10 h-10 overflow-hidden rounded-lg flex items-center justify-center">
            <img src={logoImage} alt="Student Solution Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <span className="font-bold text-xl tracking-tight text-gray-900 dark:text-gray-100">Student Solution</span>
        </Link>
        
        <div className="flex items-center space-x-6">
          <Link to="/hostels" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 font-medium hidden md:block">Hostels</Link>
          <Link to="/tiffin" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 font-medium hidden md:block">Tiffin</Link>
          <Link to="/swap" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 font-medium hidden md:block">Market</Link>
          <Link to="/jobs" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 font-medium hidden md:block">Jobs</Link>
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
            className="flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Toggle Dark Mode"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          {user ? (
            <div className="flex items-center space-x-4 ml-4 pl-4 border-l border-gray-100 dark:border-slate-800">
              <Link to="/dashboard" className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link to="/dashboard" className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 flex items-center space-x-1">
                <LayoutDashboard size={18} />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              {isAdmin && (
                <Link to="/admin" className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-1">
                  <Settings size={18} />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-gray-200 dark:border-slate-700" alt="" />
              <button onClick={onLogout} className="text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <Link to="/auth" className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-semibold hover:bg-indigo-700 transition-all">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
};

const HomeView = () => {
  const modules = [
    { id: 'hostels', title: 'FindMyStay', desc: 'Search hostels with filters & online rent payment', icon: <MapPin />, color: 'bg-blue-50 text-blue-600', path: '/hostels' },
    { id: 'tiffin', title: 'TiffinMate', desc: 'Home-cooked tiffin services', icon: <Utensils />, color: 'bg-orange-50 text-orange-600', path: '/tiffin' },
    { id: 'swap', title: 'StudentSwap', desc: 'Buy & sell old items', icon: <ShoppingBag />, color: 'bg-green-50 text-green-600', path: '/swap' },
    { id: 'jobs', title: 'Job Finder', desc: 'Student-friendly local jobs', icon: <Briefcase />, color: 'bg-purple-50 text-purple-600', path: '/jobs' },
  ];

  return (
    <div className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">Welcome to Student Solution</h1>
        <p className="text-xl text-gray-500 dark:text-gray-400">Everything a student needs, all in one place.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {modules.map((module) => (
          <Link key={module.id} to={module.path}>
            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none hover:shadow-xl dark:shadow-none transition-all h-full flex flex-col"
            >
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6", module.color)}>
                {module.icon}
              </div>
              <h3 className="text-xl font-bold mb-2">{module.title}</h3>
              <p className="text-gray-500 dark:text-gray-400 flex-grow">{module.desc}</p>
              <div className="mt-6 flex items-center text-indigo-600 font-bold group">
                Explore <ChevronRight size={18} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
};

const UserDashboard = ({ user, initiatePayment }: { 
  user: FirebaseUser | null, 
  initiatePayment: (context: {
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  }) => Promise<void> 
}) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [myHostels, setMyHostels] = useState<Hostel[]>([]);
  const [myTiffins, setMyTiffins] = useState<TiffinService[]>([]);
  const [myItems, setMyItems] = useState<MarketItem[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bookings' | 'listings' | 'notifications'>('bookings');

  useEffect(() => {
    if (!user) return;

    const paymentsQuery = query(collection(db, 'payments'), where('userId', '==', user.uid));
    const hostelsQuery = query(collection(db, 'hostels'), where('ownerId', '==', user.uid));
    const tiffinsQuery = query(collection(db, 'tiffinServices'), where('ownerId', '==', user.uid));
    const itemsQuery = query(collection(db, 'marketItems'), where('sellerId', '==', user.uid));
    const jobsQuery = query(collection(db, 'jobs'), where('postedBy', '==', user.uid));
    const notificationsQuery = query(collection(db, 'notifications'), where('userId', '==', user.uid));

    const unsubPayments = onSnapshot(paymentsQuery, (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    });

    const unsubHostels = onSnapshot(hostelsQuery, (snap) => {
      setMyHostels(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Hostel)));
    });

    const unsubTiffins = onSnapshot(tiffinsQuery, (snap) => {
      setMyTiffins(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiffinService)));
    });

    const unsubItems = onSnapshot(itemsQuery, (snap) => {
      setMyItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketItem)));
    });

    const unsubJobs = onSnapshot(jobsQuery, (snap) => {
      setMyJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
    });

    const unsubNotifications = onSnapshot(notificationsQuery, (snap) => {
      const notifs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(notifs);
      setLoading(false);
      
      // Mark as read when notifications tab is active
      if (activeTab === 'notifications') {
        notifs.forEach(async (n) => {
          if (!n.read) {
            try {
              await setDoc(doc(db, 'notifications', n.id), { read: true }, { merge: true });
            } catch (err) {
              console.error('Error marking notification as read:', err);
            }
          }
        });
      }
    });

    return () => {
      unsubPayments();
      unsubHostels();
      unsubTiffins();
      unsubItems();
      unsubJobs();
      unsubNotifications();
    };
  }, [user]);

  if (!user) return <div className="pt-24 text-center">Please sign in to view your dashboard.</div>;

  return (
    <div className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div className="flex items-center space-x-6">
          <img src={user.photoURL || ''} className="w-20 h-20 rounded-3xl border-4 border-white shadow-lg dark:shadow-none" alt="" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{user.displayName}</h1>
            <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
        </div>
        <div className="flex bg-gray-100 dark:bg-slate-700/50 p-1.5 rounded-2xl">
          <button 
            onClick={() => setActiveTab('bookings')}
            className={cn("px-6 py-2.5 rounded-xl font-bold transition-all", activeTab === 'bookings' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300")}
          >
            My Bookings
          </button>
          <button 
            onClick={() => setActiveTab('listings')}
            className={cn("px-6 py-2.5 rounded-xl font-bold transition-all", activeTab === 'listings' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300")}
          >
            My Listings
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={cn("px-6 py-2.5 rounded-xl font-bold transition-all flex items-center", activeTab === 'notifications' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300")}
          >
            Notifications
            {notifications.some(n => !n.read) && (
              <span className="ml-2 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'bookings' ? (
            <motion.div 
              key="bookings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold flex items-center">
                <CreditCard className="mr-2 text-indigo-600" /> Recent Bookings
              </h2>
              {payments.length === 0 ? (
                <div className="bg-gray-50 dark:bg-slate-800 rounded-[2rem] p-12 text-center border border-dashed border-gray-200 dark:border-slate-700">
                  <p className="text-gray-500 dark:text-gray-400">You haven't made any bookings yet.</p>
                  <Link to="/hostels" className="text-indigo-600 font-bold mt-4 inline-block">Browse Hostels</Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {payments.map((payment) => (
                    <div key={payment.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-lg">{payment.hostelName}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(payment.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold",
                          payment.status === 'Success' ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"
                        )}>
                          {payment.status}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-indigo-600">₹{payment.amount}</div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : activeTab === 'listings' ? (
            <motion.div 
              key="listings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center">
                  <MapPin className="mr-2 text-blue-600" /> My Hostels
                </h2>
                {myHostels.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 p-6 rounded-2xl">No hostels listed by you.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {myHostels.map(hostel => (
                      <div key={hostel.id} className="bg-white dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none relative overflow-hidden">
                        <div className={cn(
                          "absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest",
                          hostel.status === 'approved' ? "bg-green-100 text-green-700" :
                          hostel.status === 'rejected' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {hostel.status || 'approved'}
                        </div>
                        <div className="flex items-center space-x-4">
                          <img src={hostel.imageUrl} className="w-16 h-16 rounded-2xl object-cover" alt="" />
                          <div>
                            <h3 className="font-bold">{hostel.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">₹{hostel.price}/month</p>
                          </div>
                        </div>
                        {hostel.status === 'approved' && !hostel.listingFeePaid && (
                          <button 
                            onClick={() => initiatePayment({
                              type: 'listing_fee',
                              amount: 100,
                              item: hostel,
                              itemType: 'hostel',
                              description: `Listing Fee for ${hostel.name}`
                            })}
                            className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg dark:shadow-none shadow-indigo-100"
                          >
                            Pay Listing Fee (₹100)
                          </button>
                        )}
                        {hostel.status === 'approved' && hostel.listingFeePaid && (
                          <div className="mt-4 flex items-center justify-center text-green-600 text-xs font-bold bg-green-50 py-2 rounded-xl">
                            <Check size={14} className="mr-1" /> Listing Active
                          </div>
                        )}
                        {hostel.status === 'rejected' && hostel.rejectionReason && (
                          <div className="mt-3 p-2 bg-red-50 text-red-600 text-[10px] rounded-xl border border-red-100">
                            <strong>Reason:</strong> {hostel.rejectionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center">
                  <Utensils className="mr-2 text-orange-600" /> My Tiffin Services
                </h2>
                {myTiffins.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 p-6 rounded-2xl">No tiffin services listed by you.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {myTiffins.map(tiffin => (
                      <div key={tiffin.id} className="bg-white dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none relative overflow-hidden">
                        <div className={cn(
                          "absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest",
                          tiffin.status === 'approved' ? "bg-green-100 text-green-700" :
                          tiffin.status === 'rejected' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {tiffin.status || 'approved'}
                        </div>
                        <div className="flex items-center space-x-4">
                          <img src={tiffin.imageUrl} className="w-16 h-16 rounded-2xl object-cover" alt="" />
                          <div>
                            <h3 className="font-bold">{tiffin.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">₹{tiffin.pricePerMeal}/meal</p>
                          </div>
                        </div>
                        {tiffin.status === 'approved' && !tiffin.listingFeePaid && (
                          <button 
                            onClick={() => initiatePayment({
                              type: 'listing_fee',
                              amount: 100,
                              item: tiffin,
                              itemType: 'tiffin',
                              description: `Listing Fee for ${tiffin.name}`
                            })}
                            className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg dark:shadow-none shadow-indigo-100"
                          >
                            Pay Listing Fee (₹100)
                          </button>
                        )}
                        {tiffin.status === 'approved' && tiffin.listingFeePaid && (
                          <div className="mt-4 flex items-center justify-center text-green-600 text-xs font-bold bg-green-50 py-2 rounded-xl">
                            <Check size={14} className="mr-1" /> Listing Active
                          </div>
                        )}
                        {tiffin.status === 'rejected' && tiffin.rejectionReason && (
                          <div className="mt-3 p-2 bg-red-50 text-red-600 text-[10px] rounded-xl border border-red-100">
                            <strong>Reason:</strong> {tiffin.rejectionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center">
                  <ShoppingBag className="mr-2 text-green-600" /> My Market Items
                </h2>
                {myItems.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 p-6 rounded-2xl">No items listed for sale.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {myItems.map(item => (
                      <div key={item.id} className="bg-white dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none relative overflow-hidden">
                        <div className={cn(
                          "absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest",
                          item.status === 'approved' ? "bg-green-100 text-green-700" :
                          item.status === 'rejected' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {item.status || 'approved'}
                        </div>
                        <div className="flex items-center space-x-4">
                          <img src={item.imageUrl} className="w-16 h-16 rounded-2xl object-cover" alt="" />
                          <div>
                            <h3 className="font-bold">{item.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">₹{item.price} • {item.availability}</p>
                          </div>
                        </div>
                        {item.status === 'rejected' && item.rejectionReason && (
                          <div className="mt-3 p-2 bg-red-50 text-red-600 text-[10px] rounded-xl border border-red-100">
                            <strong>Reason:</strong> {item.rejectionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center">
                  <Briefcase className="mr-2 text-purple-600" /> My Job Postings
                </h2>
                {myJobs.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 p-6 rounded-2xl">No jobs posted by you.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {myJobs.map(job => (
                      <div key={job.id} className="bg-white dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none relative overflow-hidden">
                        <div className={cn(
                          "absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest",
                          job.status === 'approved' ? "bg-green-100 text-green-700" :
                          job.status === 'rejected' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {job.status || 'pending'}
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                            <Briefcase size={24} />
                          </div>
                          <div>
                            <h3 className="font-bold">{job.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{job.company} • ₹{job.salary}</p>
                          </div>
                        </div>
                        {job.status === 'approved' && !job.listingFeePaid && (
                          <button 
                            onClick={() => initiatePayment({
                              type: 'listing_fee',
                              amount: 20,
                              item: job,
                              itemType: 'job',
                              description: `Listing Fee for ${job.title}`
                            })}
                            className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg dark:shadow-none shadow-indigo-100"
                          >
                            Pay Listing Fee (₹20)
                          </button>
                        )}
                        {job.status === 'approved' && job.listingFeePaid && (
                          <div className="mt-4 flex items-center justify-center text-green-600 text-xs font-bold bg-green-50 py-2 rounded-xl">
                            <Check size={14} className="mr-1" /> Listing Active
                          </div>
                        )}
                        {job.status === 'rejected' && job.rejectionReason && (
                          <div className="mt-3 p-2 bg-red-50 text-red-600 text-[10px] rounded-xl border border-red-100">
                            <strong>Reason:</strong> {job.rejectionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          ) : (
            <motion.div 
              key="notifications"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold flex items-center">
                <Bell className="mr-2 text-indigo-600" /> Notifications
              </h2>
              {notifications.length === 0 ? (
                <div className="bg-gray-50 dark:bg-slate-800 rounded-[2rem] p-12 text-center border border-dashed border-gray-200 dark:border-slate-700">
                  <p className="text-gray-500 dark:text-gray-400">No notifications yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={cn(
                        "p-6 rounded-[2rem] border transition-all flex items-start space-x-4",
                        notif.read ? "bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 opacity-75" : "bg-indigo-50 border-indigo-100 shadow-sm dark:shadow-none"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        notif.type === 'success' ? "bg-green-100 text-green-600" :
                        notif.type === 'error' ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-600"
                      )}>
                        {notif.type === 'success' ? <CheckCircle size={20} /> :
                         notif.type === 'error' ? <XCircle size={20} /> : <Bell size={20} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">{notif.title}</h3>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {new Date(notif.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{notif.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

const AdminDashboard = ({ user }: { user: FirebaseUser | null }) => {
  const [stats, setStats] = useState({ users: 0, hostels: 0, tiffins: 0, items: 0, jobs: 0, pending: 0, revenue: 0 });
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [pendingRequests, setPendingRequests] = useState<{id: string, type: 'hostel' | 'tiffin' | 'item' | 'job', data: any}[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRequest, setEditingRequest] = useState<{id: string, type: 'hostel' | 'tiffin' | 'item' | 'job', data: any} | null>(null);
  const [rejectionModal, setRejectionModal] = useState<{id: string, type: string} | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const hostelsSnap = await getDocs(collection(db, 'hostels'));
      const tiffinsSnap = await getDocs(collection(db, 'tiffinServices'));
      const itemsSnap = await getDocs(collection(db, 'marketItems'));
      const jobsSnap = await getDocs(collection(db, 'jobs'));
      const paymentsSnap = await getDocs(collection(db, 'payments'));

      const hostels = hostelsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Hostel));
      const tiffins = tiffinsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiffinService));
      const items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketItem));
      const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

      const pending = [
        ...hostels.filter(h => h.status === 'pending').map(h => ({ id: h.id, type: 'hostel' as const, data: h })),
        ...tiffins.filter(t => t.status === 'pending').map(t => ({ id: t.id, type: 'tiffin' as const, data: t })),
        ...items.filter(i => i.status === 'pending').map(i => ({ id: i.id, type: 'item' as const, data: i })),
        ...jobs.filter(j => j.status === 'pending').map(j => ({ id: j.id, type: 'job' as const, data: j }))
      ];

      const totalRevenue = payments.reduce((acc, curr) => acc + (curr.status === 'Success' ? curr.amount : 0), 0);

      setStats({
        users: usersSnap.size,
        hostels: hostels.filter(h => !h.status || h.status === 'approved').length,
        tiffins: tiffins.filter(t => !t.status || t.status === 'approved').length,
        items: items.filter(i => !i.status || i.status === 'approved').length,
        jobs: jobs.filter(j => !j.status || j.status === 'approved').length,
        pending: pending.length,
        revenue: totalRevenue
      });

      setPendingRequests(pending);
      setRecentPayments(payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5));
      setAllUsers(usersSnap.docs.map(doc => doc.data() as UserData));

      // Fetch admin notifications
      const notifsSnap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', 'ADMIN'), orderBy('createdAt', 'desc')));
      setNotifications(notifsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));

      setLoading(false);
    } catch (error) {
      console.error("Admin fetch error:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleApprove = async (id: string, type: string, ownerId: string, title: string) => {
    try {
      const collectionName = type === 'hostel' ? 'hostels' : type === 'tiffin' ? 'tiffinServices' : type === 'item' ? 'marketItems' : 'jobs';
      await setDoc(doc(db, collectionName, id), { status: 'approved' }, { merge: true });
      
      let message = `Your listing "${title}" has been approved and is now live.`;
      if (type === 'hostel' || type === 'tiffin' || type === 'job') {
        message = `Your listing "${title}" has been approved! Please pay the listing fee to make it live.`;
      }
      
      await sendNotification(ownerId, 'Listing Approved!', message, 'success');
      fetchData();
    } catch (err) {
      console.error('Approval error:', err);
    }
  };

  const handleReject = async () => {
    if (!rejectionModal) return;
    const { id, type } = rejectionModal;
    try {
      const collectionName = type === 'hostel' ? 'hostels' : type === 'tiffin' ? 'tiffinServices' : type === 'item' ? 'marketItems' : 'jobs';
      const request = pendingRequests.find(r => r.id === id);
      const ownerId = request?.data.ownerId || request?.data.sellerId || request?.data.postedBy;
      const title = request?.data.name || request?.data.title;

      await setDoc(doc(db, collectionName, id), { 
        status: 'rejected',
        rejectionReason: rejectionReason 
      }, { merge: true });

      await sendNotification(ownerId, 'Listing Rejected', `Your listing "${title}" was rejected. Reason: ${rejectionReason}`, 'error');
      setRejectionModal(null);
      setRejectionReason('');
      fetchData();
    } catch (err) {
      console.error('Rejection error:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingRequest) return;
    const { id, type, data } = editingRequest;
    try {
      const collectionName = type === 'hostel' ? 'hostels' : type === 'tiffin' ? 'tiffinServices' : type === 'item' ? 'marketItems' : 'jobs';
      await setDoc(doc(db, collectionName, id), data, { merge: true });
      setEditingRequest(null);
      fetchData();
    } catch (err) {
      console.error('Edit save error:', err);
    }
  };

  if (!user) return <div className="pt-24 text-center">Unauthorized access.</div>;

  return (
    <div className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Admin Control Panel</h1>
        <p className="text-gray-500 dark:text-gray-400">Global overview and management of Student Solution platform.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {[
              { label: 'Total Users', value: stats.users, icon: <Users />, color: 'bg-blue-50 text-blue-600' },
              { label: 'Active Listings', value: stats.hostels + stats.tiffins + stats.items + stats.jobs, icon: <Activity />, color: 'bg-purple-50 text-purple-600' },
              { label: 'Pending Approvals', value: stats.pending, icon: <Clock />, color: 'bg-yellow-50 text-yellow-600' },
              { label: 'Total Payments', value: stats.payments, icon: <CreditCard />, color: 'bg-green-50 text-green-600' },
              { label: 'Total Revenue', value: `₹${stats.revenue}`, icon: <BarChart3 />, color: 'bg-orange-50 text-orange-600' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", stat.color)}>
                  {React.cloneElement(stat.icon as React.ReactElement, { size: 20 })}
                </div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">{stat.value}</h3>
              </div>
            ))}
          </div>

          {/* Pending Approvals Section */}
          <section className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
            <h2 className="text-2xl font-bold mb-8 flex items-center">
              <Clock className="mr-2 text-yellow-600" /> Pending Approvals
              {stats.pending > 0 && (
                <span className="ml-3 bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full">
                  {stats.pending} New
                </span>
              )}
            </h2>
            
            {pendingRequests.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-[2rem] border border-dashed border-gray-200 dark:border-slate-700">
                <CheckCircle className="mx-auto text-gray-300 mb-4" size={48} />
                <p className="text-gray-500 dark:text-gray-400 font-medium">All caught up! No pending requests.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="bg-gray-50 dark:bg-slate-800 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800 hover:border-indigo-200 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center",
                          req.type === 'hostel' ? "bg-blue-100 text-blue-600" :
                          req.type === 'tiffin' ? "bg-orange-100 text-orange-600" :
                          req.type === 'item' ? "bg-green-100 text-green-600" : "bg-purple-100 text-purple-600"
                        )}>
                          {req.type === 'hostel' ? <MapPin size={20} /> :
                           req.type === 'tiffin' ? <Utensils size={20} /> :
                           req.type === 'item' ? <ShoppingBag size={20} /> : <Briefcase size={20} />}
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{req.type}</p>
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">{req.data.name || req.data.title}</h3>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => setEditingRequest(req)}
                          className="p-2 bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                        >
                          <Edit size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-6">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{req.data.description || req.data.address}</p>
                      <p className="text-sm font-bold text-indigo-600">₹{req.data.price || req.data.pricePerMeal || req.data.salary}</p>
                    </div>

                    <div className="flex space-x-3">
                      <button 
                        onClick={() => handleApprove(req.id, req.type, req.data.ownerId || req.data.sellerId || req.data.postedBy, req.data.name || req.data.title)}
                        className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-all flex items-center justify-center space-x-2"
                      >
                        <Check size={18} />
                        <span>Approve</span>
                      </button>
                      <button 
                        onClick={() => setRejectionModal({ id: req.id, type: req.type })}
                        className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center space-x-2"
                      >
                        <X size={18} />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Recent Payments */}
            <section className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
              <h2 className="text-2xl font-bold mb-8 flex items-center">
                <CreditCard className="mr-2 text-indigo-600" /> Recent Transactions
              </h2>
              <div className="space-y-6">
                {recentPayments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                    <div>
                      <p className="font-bold">{payment.hostelName}</p>
                      <p className="text-xs text-gray-400">{new Date(payment.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-indigo-600">₹{payment.amount}</p>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{payment.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Users List */}
            <section className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
              <h2 className="text-2xl font-bold mb-8 flex items-center">
                <Users className="mr-2 text-indigo-600" /> Registered Users
              </h2>
              <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {allUsers.map(u => (
                  <div key={u.uid} className="flex items-center space-x-4 p-3 hover:bg-gray-50 dark:bg-slate-800 rounded-2xl transition-colors">
                    <img src={u.photoURL} className="w-10 h-10 rounded-full" alt="" />
                    <div>
                      <p className="font-bold text-sm">{u.displayName}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Admin Notifications */}
          <section className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
            <h2 className="text-2xl font-bold mb-8 flex items-center">
              <Bell className="mr-2 text-indigo-600" /> Admin Notifications
            </h2>
            {notifications.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No notifications.</p>
            ) : (
              <div className="space-y-4">
                {notifications.map(notif => (
                  <div key={notif.id} className={cn(
                    "p-4 rounded-2xl border flex items-start space-x-4",
                    notif.read ? "bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 opacity-60" : "bg-indigo-50 border-indigo-100"
                  )}>
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Bell size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{notif.title}</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{notif.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(notif.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Edit Modal */}
          {editingRequest && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black">Edit Listing</h3>
                  <button onClick={() => setEditingRequest(null)} className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Title / Name</label>
                    <input 
                      type="text" 
                      value={editingRequest.data.name || editingRequest.data.title}
                      onChange={(e) => setEditingRequest({
                        ...editingRequest,
                        data: { ...editingRequest.data, [editingRequest.type === 'hostel' || editingRequest.type === 'tiffin' ? 'name' : 'title']: e.target.value }
                      })}
                      className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Description / Address</label>
                    <textarea 
                      value={editingRequest.data.description || editingRequest.data.address}
                      onChange={(e) => setEditingRequest({
                        ...editingRequest,
                        data: { ...editingRequest.data, [editingRequest.type === 'hostel' ? 'address' : 'description']: e.target.value }
                      })}
                      className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold h-32"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Price / Salary</label>
                      <input 
                        type="number" 
                        value={editingRequest.data.price || editingRequest.data.pricePerMeal || editingRequest.data.salary}
                        onChange={(e) => setEditingRequest({
                          ...editingRequest,
                          data: { ...editingRequest.data, [editingRequest.type === 'hostel' || editingRequest.type === 'item' ? 'price' : editingRequest.type === 'tiffin' ? 'pricePerMeal' : 'salary']: Number(e.target.value) }
                        })}
                        className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 mt-10">
                  <button 
                    onClick={handleSaveEdit}
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg dark:shadow-none shadow-indigo-200"
                  >
                    Save Changes
                  </button>
                  <button 
                    onClick={() => setEditingRequest(null)}
                    className="flex-1 bg-gray-100 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Rejection Modal */}
          {rejectionModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 shadow-2xl"
              >
                <h3 className="text-2xl font-black mb-4">Reject Listing</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">Please provide a reason for rejecting this listing. This will be sent to the user.</p>
                
                <textarea 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Incomplete details, inappropriate content..."
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-red-500 transition-all font-bold h-32 mb-8"
                />

                <div className="flex space-x-4">
                  <button 
                    onClick={handleReject}
                    disabled={!rejectionReason.trim()}
                    className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg dark:shadow-none shadow-red-200"
                  >
                    Confirm Rejection
                  </button>
                  <button 
                    onClick={() => {
                      setRejectionModal(null);
                      setRejectionReason('');
                    }}
                    className="flex-1 bg-gray-100 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Modules ---

const FindMyStay = ({ user, initiatePayment }: { 
  user: FirebaseUser | null, 
  initiatePayment: (context: {
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  }) => Promise<void>
}) => {
  const navigate = useNavigate();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHostel, setSelectedHostel] = useState<Hostel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('All');
  const [acFilter, setAcFilter] = useState<string>('All');
  const [isAddingHostel, setIsAddingHostel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null);
  const [roomImagesPreviews, setRoomImagesPreviews] = useState<string[]>([]);
  const [newHostel, setNewHostel] = useState<Partial<Hostel>>({
    name: '',
    address: '',
    price: 0,
    amenities: [],
    rating: 5.0,
    imageUrl: '',
    images: [],
    contact: '',
    availableRooms: 1,
    roomType: 'Single',
    isAC: false,
    bankAccountNumber: '',
    ifscCode: ''
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'rooms') => {
    const files = e.target.files;
    if (!files) return;

    if (type === 'main') {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setMainImagePreview(base64String);
        setNewHostel(prev => ({ ...prev, imageUrl: base64String }));
      };
      reader.readAsDataURL(file);
    } else {
      const fileList = Array.from(files) as File[];
      const newPreviews: string[] = [];
      
      fileList.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          newPreviews.push(base64String);
          if (newPreviews.length === fileList.length) {
            setRoomImagesPreviews(prev => [...prev, ...newPreviews]);
            setNewHostel(prev => ({ 
              ...prev, 
              images: [...(prev.images || []), ...newPreviews] 
            }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'hostels'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedHostels = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Hostel[];
      
      // Filter only approved ones for public view
      const approvedHostels = fetchedHostels.filter(h => !h.status || h.status === 'approved');
      
      // Mock Data for initial view if empty
      const mockHostels: Hostel[] = [
        {
          id: '1',
          name: 'Green Valley Residency',
          address: '123 University Road, North Campus',
          price: 8500,
          rating: 4.5,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2025/Dec/15/full_photo/GR2-296295-2658329.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2025/Dec/15/full_photo/GR2-296295-2658285.jpeg',
            'https://picsum.photos/seed/hostel1-2/800/600',
             
          ],
          amenities: ['WiFi', 'Laundry', 'Gym', 'CCTV'],
          contact: '+91 9876543210',
          availableRooms: 5,
          roomType: 'Double',
          isAC: true,
          bankAccountNumber: '1234567890',
          ifscCode: 'HDFC0001234'
        },
        {
          id: '2',
          name: 'Agarwal Hostel',
          address: 'Near Metro Station,lucknow',
          price: 6000,
          rating: 4.2,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Sep/23/full_photo/GR2-261813-1500659.jpeg',
          images: [
            
          ],
          amenities: ['WiFi', 'Mess', 'Library'],
          contact: '+91 9876543211',
          availableRooms: 2,
          roomType: 'Triple',
          isAC: false,
          bankAccountNumber: '1234567891',
          ifscCode: 'SBIN0001234'
        },
        {
          id: '3',
          name: 'Prime Boys PG',
          address: 'Matiyari,Lucknow',
          price: 7000,
          rating: 4.7,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2025/Jan/28/full_photo/GR2-480585-2378899.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2025/Jan/28/full_photo/GR2-480585-2378913.jpg'
          ],
          amenities: ['WiFi', 'kitchen', 'inverter', 'CCTV'],
          contact: '+91 7380587065',
          availableRooms: 12,
          roomType: 'Double',
          isAC: true,
          bankAccountNumber: '1234567892',
          ifscCode: 'ICIC0001234'
        },
        {
          id: '4',
          name: 'Enclave PG',
          address: 'Near Metro Station,Gomti Nagar,Lucknow',
          price: 6000,
          rating: 4.2,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2026/Mar/05/full_photo/GR2-529883-2724979.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2026/Mar/05/full_photo/GR2-529883-2724981.jpg',  
          ],
          amenities: ['WiFi', 'Mess', 'Library'],
          contact: '+91 9876543211',
          availableRooms: 2,
          roomType: 'Triple',
          isAC: false,
          bankAccountNumber: '1234567893',
          ifscCode: 'AXIS0001234'
        },
        {
          id: '5',
          name: 'Shivoham Stays',
          address: 'Mahmurganj,Varanasi',
          price: 5000,
          rating: 4.5,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2025/Sep/11/full_photo/GR2-482499-2579713.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2026/Feb/06/full_photo/GR2-482499-2702669.jpeg'
          ],
          amenities: ['WiFi', 'inverter', 'RO', 'CCTV'],
          contact: '+91 8845643210',
          availableRooms: 4,
          roomType: 'Single',
          isAC: false
        },
        {
          id: '6',
          name: 'Home Away PG',
          address: 'Lanka ,Varanasi',
          price: 6000,
          rating: 4.5,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2025/Dec/15/full_photo/GR2-296295-2658329.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Jun/09/full_photo/GR2-296295-1392335.jpg'
          ],
          amenities: ['WiFi', 'Laundry', 'CCTV'],
          contact: '+91 9876543532',
          availableRooms: 8,
          roomType: 'Single',
          isAC: false
        },
        {
          id: '7',
          name: 'Sri Kashi Vishwanath PG',
          address: 'near old VT,Varanasi',
          price: 4500,
          rating: 4.2,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Sep/12/full_photo/GR2-229549-1090053.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Sep/12/full_photo/GR2-229549-1090039.jpg',
             
          ],
          amenities: ['WiFi',  'CCTV'],
          contact: '+91 8184654321',
          availableRooms: 8,
          roomType: 'Single',
          isAC: false
        },
        {
          id: '8',
          name: 'Vatsalya Girls PG',
          address: 'Pandeypur,Varanasi',
          price: 3500,
          rating: 4.0,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Nov/13/full_photo/GR2-249725-1173615.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Nov/13/full_photo/GR2-249725-1173625.jpeg'
          ],
          amenities: ['WiFi'],
          contact: '+91 9976543210',
          availableRooms: 3,
          roomType: 'Double',
          isAC: false
        },
        {
          id: '9',
          name: 'Govardhan PG',
          address: 'Durgakund,Varanasi',
          price: 4500,
          rating: 3.5,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Nov/15/full_photo/GR2-250275-1175669.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Nov/15/full_photo/GR2-250275-1175673.jpg'
          ],
          amenities: ['WiFi','inverter','CCTV'],
          contact: '+91 9876543210',
          availableRooms: 9,
          roomType: 'Triple',
          isAC: false
        },
        {
          id: '10',
          name: 'Obris Hostel',
          address: 'Krishna Nagar, Lucknow',
          price: 6500,
          rating: 4.6,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Nov/09/full_photo/GR2-327209-1549541.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Nov/09/full_photo/GR2-327209-1549509.jpg',
             
          ],
          amenities: ['WiFi','badminton court','inverter', 'CCTV'],
          contact: '+91 9258543210',
          availableRooms: 7,
          roomType: 'Single',
          isAC: true
        },
        {
          id: '11',
          name: 'Jupiter Palace',
          address: 'Ashiyana,Lucknow',
          price: 5500,
          rating: 4.1,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Jan/19/full_photo/GR2-241081-1242921.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Jan/19/full_photo/GR2-241081-1242941.jpg',
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2022/Jan/19/full_photo/GR2-241081-1242965.jpg'
          ],
          amenities: ['WiFi', 'inverter', 'CCTV'],
          contact: '+91 9876543210',
          availableRooms: 8,
          roomType: 'Single',
          isAC: true
        },
        {
          id: '12',
          name: 'Kia PG',
          address: 'Transport Nagar, Lucknow',
          price: 3800,
          rating: 3.8,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2020/Apr/23/full_photo/GR2-83899-345685.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2020/Apr/23/full_photo/GR2-83899-345687.jpeg'
          ],
          amenities: ['WiFi', 'inverter', 'kitchen', 'CCTV'],
          contact: '+91 9878954321',
          availableRooms: 12,
          roomType: 'Double',
          isAC: false
        },
        {
          id: '13',
          name: 'AVS Boys PG',
          address: 'Opposite BBD University,Lucknow',
          price: 6500,
          rating: 4.1,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Sep/05/full_photo/GR2-381541-1875331.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Sep/05/full_photo/GR2-381541-1875341.jpeg'
          ],
          amenities: ['WiFi', 'inverter', 'CCTV'],
          contact: '+91 8181081042',
          availableRooms: 6,
          roomType: 'Double',
          isAC: true
        },
        {
          id: '14',
          name: 'Krishna Hostel',
          address: 'near knit,sultanpur',
          price: 3000,
          rating: 4.0,
          imageUrl: 'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765086818/nm1h8f1w7desrdoe3oae.jpg',
          images: [
            'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765101669/qzzouqdex4trmc1g0k0m.jpg'
             
          ],
          amenities: ['WiFi', 'inverter', 'RO', 'CCTV'],
          contact: '+91 7275283979',
          availableRooms: 10,
          roomType: 'Double',
          isAC: false
        },
        {
          id: '15',
          name: 'Madhuram Girls PG',
          address: 'near freedom digital library, sultanpur',
          price: 3500,
          rating: 4.2,
          imageUrl: 'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765095288/twmg2rhrrcht4uzmbqdq.jpg',
          images: [
            'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765101666/cbm4up7mzcg6mqymkiqv.jpg',
          ],
          amenities: ['WiFi', 'inverter', 'Kitchen', 'CCTV'],
          contact: '+91 6386420434',
          availableRooms: 15,
          roomType: 'Single',
          isAC: false
        },
        {
          id: '16',
          name: 'Riverview Hostel',
          address: 'near gomti river,KNIT Campus,sultanpur',
          price: 2500,
          rating: 3.2,
          imageUrl: 'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765086806/iwzovscnj6ewcvraby2p.jpg',
          images: [
            'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765102366/kxzllw126xrjybptzlds.jpg'
          ],
          amenities: ['WiFi',  'RO', ],
          contact: '+91 9876543210',
          availableRooms: 5,
          roomType: 'Single',
          isAC:false
        },
        {
          id: '17',
          name: 'Khan Boys hostel',
          address: 'near freedomdigital libraray, sultanpur',
          price: 2500,
          rating: 4.0,
          imageUrl: 'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765099360/mkwzkzwlweaqsvbxdpnp.jpg',
          images: [
            'https://res.cloudinary.com/dsq3qufwz/image/upload/v1765101673/n0t3tt7cl5cnif80jeaz.jpg'
          ],
          amenities: ['WiFi', 'inverter', 'library', 'CCTV'],
          contact: '+91  9335873464',
          availableRooms: 7,
          roomType: 'Single',
          isAC: false
        },
        {
          id: '18',
          name: 'Sangam PG',
          address: 'Civil lines, prayagraj',
          price: 5500,
          rating: 4.5,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Aug/01/full_photo/GR2-211853-1017081.jpg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2021/Aug/01/full_photo/GR2-211853-1017107.jpg'
          ],
          amenities: ['WiFi', 'inverter', 'kitchen', 'CCTV'],
          contact: '+91 9996543210',
          availableRooms: 5,
          roomType: 'Single',
          isAC: true
        },
        {
          id: '19',
          name: 'Nestoria Girls hostel',
          address: 'beli, prayagraj',
          price: 3500,
          rating: 4.1,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Jan/23/full_photo/GR2-345521-1638173.png',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Jan/23/full_photo/GR2-345521-1638165.png'
          ],
          amenities: ['WiFi', 'inverter', 'CCTV'],
          contact: '+91 9876543210',
          availableRooms: 8,
          roomType: 'Double',
          isAC: false
        },
        {
          id: '20',
          name: 'RK Girls Hostel',
          address: 'beli, prayagraj',
          price: 3500,
          rating: 4.1,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Nov/06/full_photo/GR2-405195-1934651.jpeg',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Nov/06/full_photo/GR2-405195-1934655.jpeg'
          ],
          amenities: ['WiFi', 'inverter', 'CCTV'],
          contact: '+91 9876544650',
          availableRooms: 5,
          roomType: 'Single',
          isAC: false
        },
        {
          id: '21',
          name: 'Happy Home PG',
          address: 'south malak,prayagraj',
          price: 3500,
          rating: 4.4,
          imageUrl: 'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Jan/25/full_photo/GR2-346007-1640947.png',
          images: [
            'https://img.staticmb.com/mbphoto/pg/grd2/cropped_images/2023/Jan/25/full_photo/GR2-346007-1640953.png'
          ],
          amenities: ['WiFi', 'inverter', 'RO', 'CCTV'],
          contact: '+91 9876543210',
          availableRooms: 12,
          roomType: 'Triple',
          isAC: false
        }
      ];

      setHostels([...mockHostels, ...approvedHostels]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddHostel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'hostels'), {
        ...newHostel,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
        reviews: [],
        rating: newHostel.rating || 5.0,
        status: 'pending',
        bankAccountNumber: newHostel.bankAccountNumber,
        ifscCode: newHostel.ifscCode
      });
      await sendNotification('ADMIN', 'New Hostel Listing', `${user.displayName} has submitted a new hostel: ${newHostel.name}`, 'info', '/admin');
      setIsAddingHostel(false);
      setMainImagePreview(null);
      setRoomImagesPreviews([]);
      setNewHostel({
        name: '',
        address: '',
        price: 0,
        amenities: [],
        rating: 5.0,
        imageUrl: '',
        images: [],
        contact: '',
        availableRooms: 1,
        roomType: 'Single',
        isAC: false,
        bankAccountNumber: '',
        ifscCode: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'hostels');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddReview = async (hostelId: string) => {
    if (!user || !selectedHostel) return;
    setIsSubmittingReview(true);
    
    const review: Review = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      userName: user.displayName || 'Anonymous',
      rating: newReview.rating,
      comment: newReview.comment,
      createdAt: new Date().toISOString()
    };

    const updatedReviews = [...(selectedHostel.reviews || []), review];
    const newRating = updatedReviews.reduce((acc, curr) => acc + curr.rating, 0) / updatedReviews.length;

    try {
      await setDoc(doc(db, 'hostels', hostelId), {
        ...selectedHostel,
        reviews: updatedReviews,
        rating: Number(newRating.toFixed(1))
      });
      setNewReview({ rating: 5, comment: '' });
      setSelectedHostel(prev => prev ? { ...prev, reviews: updatedReviews, rating: Number(newRating.toFixed(1)) } : null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `hostels/${hostelId}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const filteredHostels = hostels.filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         h.address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRoomType = roomTypeFilter === 'All' || h.roomType === roomTypeFilter;
    const matchesAC = acFilter === 'All' || (acFilter === 'AC' ? h.isAC : !h.isAC);
    return matchesSearch && matchesRoomType && matchesAC;
  });

  return (
    <div className="pt-24 pb-12 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center space-x-4 mb-2">
            <Link to="/" className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors"><ArrowLeft size={24} /></Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">FindMyStay</h1>
            <button 
              onClick={() => {
                if (user) {
                  setIsAddingHostel(true);
                } else {
                  navigate('/auth');
                }
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold flex items-center space-x-2 hover:bg-indigo-700 transition-all shadow-lg dark:shadow-none shadow-indigo-100"
            >
              <Plus size={18} />
              <span>List Your Hostel</span>
            </button>
          </div>
          <p className="text-gray-500 dark:text-gray-400 ml-12">Discover the best hostels and PGs near your campus.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name or location..." 
              className="pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900"
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value)}
          >
            <option value="All">All Room Types</option>
            <option value="Single">Single</option>
            <option value="Double">Double</option>
            <option value="Triple">Triple</option>
            <option value="Sharing">Sharing</option>
          </select>
          <select 
            className="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900"
            value={acFilter}
            onChange={(e) => setAcFilter(e.target.value)}
          >
            <option value="All">AC / Non-AC</option>
            <option value="AC">AC Only</option>
            <option value="Non-AC">Non-AC Only</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredHostels.map((hostel) => (
            <motion.div 
              key={hostel.id}
              layoutId={hostel.id}
              onClick={() => setSelectedHostel(hostel)}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-none hover:shadow-xl dark:shadow-none transition-all cursor-pointer group"
            >
              <div className="relative h-56 overflow-hidden">
                <img 
                  src={hostel.imageUrl} 
                  alt={hostel.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 right-4 bg-white dark:bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center space-x-1 shadow-sm dark:shadow-none">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{hostel.rating}</span>
                </div>
                {!hostel.ownerId && (
                  <div className="absolute top-4 left-4 bg-gray-900/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm dark:shadow-none pointer-events-none">
                    <span className="text-[10px] md:text-xs font-bold text-white tracking-widest uppercase">Demo</span>
                  </div>
                )}
                {hostel.ownerId && hostel.status === 'approved' && (
                  <div className="absolute top-4 left-4 bg-green-500/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center shadow-sm dark:shadow-none pointer-events-none">
                    <CheckCircle size={14} className="text-white mr-1" />
                    <span className="text-[10px] md:text-xs font-bold text-white uppercase">Verified</span>
                  </div>
                )}
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg dark:shadow-none">
                    {hostel.roomType}
                  </span>
                  {hostel.isAC && (
                    <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg dark:shadow-none">
                      AC
                    </span>
                  )}
                </div>
              </div>
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors">{hostel.name}</h3>
                  <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600">₹{hostel.price}</span>
                    <span className="text-gray-400 text-xs block">/month</span>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 flex items-center">
                  <MapPin size={14} className="mr-1" /> {hostel.address}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {hostel.amenities.slice(0, 3).map((amenity, idx) => (
                    <span key={idx} className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-lg border border-gray-100 dark:border-slate-800">
                      {amenity}
                    </span>
                  ))}
                  {hostel.amenities.length > 3 && (
                    <span className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-lg border border-gray-100 dark:border-slate-800">
                      +{hostel.amenities.length - 3} more
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <span className="text-sm font-medium text-green-600 flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    {hostel.availableRooms} rooms available
                  </span>
                  <button className="text-indigo-600 font-bold text-sm hover:underline">View Details</button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedHostel && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedHostel(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={selectedHostel.id}
              className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[32px] md:rounded-[40px] overflow-hidden relative z-10 shadow-2xl flex flex-col md:flex-row max-h-[90vh] md:max-h-[85vh]"
            >
              <button 
                onClick={() => setSelectedHostel(null)}
                className="absolute top-4 right-4 md:top-6 md:right-6 z-30 w-10 h-10 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all shadow-lg dark:shadow-none"
              >
                <X size={20} />
              </button>

              <div className="w-full md:w-1/2 h-64 md:h-auto relative flex-shrink-0">
                <div className="h-full overflow-x-auto md:overflow-y-auto no-scrollbar flex md:block snap-x md:snap-y snap-mandatory">
                  {[selectedHostel.imageUrl, ...selectedHostel.images].map((img, idx) => (
                    <div key={idx} className="h-full w-full flex-shrink-0 snap-start">
                      <img 
                        src={img} 
                        alt={`${selectedHostel.name} ${idx}`} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                  {[selectedHostel.imageUrl, ...selectedHostel.images].map((_, idx) => (
                    <div key={idx} className="w-1.5 h-1.5 rounded-full bg-white dark:bg-slate-900/60 shadow-sm dark:shadow-none"></div>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-1/2 p-6 md:p-10 lg:p-12 overflow-y-auto flex flex-col">
                <div className="mb-6 md:mb-8">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="bg-indigo-100 text-indigo-600 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full">
                      {selectedHostel.roomType}
                    </span>
                    {selectedHostel.isAC && (
                      <span className="bg-blue-100 text-blue-600 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full">
                        AC Room
                      </span>
                    )}
                    <span className="bg-green-100 text-green-600 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full">
                      {selectedHostel.availableRooms} Available
                    </span>
                    {!selectedHostel.ownerId && (
                      <span className="bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">
                        Demo
                      </span>
                    )}
                    {selectedHostel.ownerId && selectedHostel.status === 'approved' && (
                      <span className="bg-green-100 text-green-600 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full flex items-center uppercase">
                        <CheckCircle size={12} className="mr-1" /> Verified
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-gray-100 mb-2 leading-tight">{selectedHostel.name}</h2>
                  <p className="text-gray-500 dark:text-gray-400 flex items-center text-sm md:text-lg">
                    <MapPin size={16} className="mr-2 text-indigo-500 flex-shrink-0" /> {selectedHostel.address}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
                  <div className="bg-gray-50 dark:bg-slate-800 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 dark:border-slate-800">
                    <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-1">Monthly Rent</p>
                    <p className="text-xl md:text-3xl font-black text-indigo-600">₹{selectedHostel.price}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-800 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 dark:border-slate-800">
                    <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-1">Rating</p>
                    <div className="flex items-center space-x-1">
                      <Star size={18} className="text-yellow-500 fill-yellow-500 md:w-6 md:h-6" />
                      <span className="text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100">{selectedHostel.rating}</span>
                    </div>
                  </div>
                </div>

                <div className="mb-6 md:mb-8">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 md:mb-4 text-base md:text-lg">Amenities</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                    {selectedHostel.amenities.map((amenity, idx) => (
                      <div key={idx} className="flex items-center space-x-3 bg-white dark:bg-slate-900 p-2.5 md:p-3 rounded-xl md:rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
                        <div className="w-7 h-7 md:w-8 md:h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 flex-shrink-0">
                          <Check size={14} className="md:w-4 md:h-4" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 font-medium text-sm md:text-base">{amenity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reviews Section */}
                <div className="mb-8 border-t border-gray-100 dark:border-slate-800 pt-8">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-6 text-xl flex items-center">
                    <Star size={20} className="mr-2 text-yellow-500 fill-yellow-500" />
                    Reviews & Ratings
                  </h4>

                  {/* Review Form - Only for listed hostels */}
                  {selectedHostel.ownerId && user && (
                    <div className="bg-gray-50 dark:bg-slate-800 p-6 rounded-3xl mb-8 border border-gray-100 dark:border-slate-800">
                      <p className="font-bold text-gray-900 dark:text-gray-100 mb-4">Add your review</p>
                      <div className="flex items-center space-x-2 mb-4">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setNewReview(prev => ({ ...prev, rating: star }))}
                            className="focus:outline-none transition-transform hover:scale-110"
                          >
                            <Star
                              size={24}
                              className={cn(
                                star <= newReview.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              )}
                            />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={newReview.comment}
                        onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                        placeholder="Share your experience..."
                        className="w-full px-4 py-3 border border-gray-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 mb-4 min-h-[100px] text-sm"
                      />
                      <button
                        onClick={() => handleAddReview(selectedHostel.id)}
                        disabled={isSubmittingReview || !newReview.comment.trim()}
                        className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmittingReview ? 'Posting...' : 'Post Review'}
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {selectedHostel.reviews && selectedHostel.reviews.length > 0 ? (
                      selectedHostel.reviews.map((review) => (
                        <div key={review.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-none">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                {review.userName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{review.userName}</p>
                                <p className="text-gray-400 text-[10px]">{new Date(review.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center bg-yellow-50 px-2 py-0.5 rounded-full">
                              <Star size={10} className="text-yellow-500 fill-yellow-500 mr-1" />
                              <span className="text-[10px] font-bold text-yellow-700">{review.rating}</span>
                            </div>
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{review.comment}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 bg-gray-50 dark:bg-slate-800 rounded-3xl border border-dashed border-gray-200 dark:border-slate-700">
                        <p className="text-gray-400 text-sm italic">No reviews yet. Be the first to review!</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex flex-col sm:flex-row md:flex-col gap-3 md:gap-4">
                  <button 
                    onClick={() => initiatePayment({
                      type: 'hostel_rent',
                      amount: selectedHostel.price,
                      item: selectedHostel,
                      description: `Rent Payment for ${selectedHostel.name}`
                    })}
                    className="flex-1 bg-indigo-600 text-white py-4 md:py-5 rounded-2xl md:rounded-3xl font-bold text-base md:text-xl hover:bg-indigo-700 shadow-xl dark:shadow-none shadow-indigo-200 transition-all flex items-center justify-center space-x-3"
                  >
                    <ShoppingBag size={20} className="md:w-6 md:h-6" />
                    <span>Pay Rent Online</span>
                  </button>
                  <a 
                    href={`tel:${selectedHostel.contact}`}
                    className="flex-1 bg-white dark:bg-slate-900 text-indigo-600 border-2 border-indigo-100 py-4 md:py-5 rounded-2xl md:rounded-3xl font-bold text-base md:text-xl hover:bg-indigo-50 transition-all flex items-center justify-center space-x-3"
                  >
                    <Phone size={20} className="md:w-6 md:h-6" />
                    <span>Contact Owner</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Hostel Modal */}
      <AnimatePresence>
        {isAddingHostel && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingHostel(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[40px] p-8 md:p-12 relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setIsAddingHostel(false)}
                className="absolute top-6 right-6 w-10 h-10 bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 transition-all"
              >
                <X size={24} />
              </button>

              <h3 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-8">List Your Hostel</h3>
              
              <form onSubmit={handleAddHostel} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Hostel Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="e.g. Green Valley Residency"
                      value={newHostel.name}
                      onChange={e => setNewHostel({...newHostel, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Monthly Rent (₹)</label>
                    <input 
                      required
                      type="number" 
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="e.g. 8500"
                      value={newHostel.price}
                      onChange={e => setNewHostel({...newHostel, price: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Address</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Full address of the hostel"
                    value={newHostel.address}
                    onChange={e => setNewHostel({...newHostel, address: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Room Type</label>
                    <select 
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      value={newHostel.roomType}
                      onChange={e => setNewHostel({...newHostel, roomType: e.target.value as any})}
                    >
                      <option value="Single">Single</option>
                      <option value="Double">Double</option>
                      <option value="Triple">Triple</option>
                      <option value="Sharing">Sharing</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Available Rooms</label>
                    <input 
                      required
                      type="number" 
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      value={newHostel.availableRooms}
                      onChange={e => setNewHostel({...newHostel, availableRooms: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">AC / Non-AC</label>
                    <div className="flex items-center h-14 space-x-4">
                      <label className="flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                          checked={newHostel.isAC}
                          onChange={e => setNewHostel({...newHostel, isAC: e.target.checked})}
                        />
                        <span className="ml-2 text-gray-700 dark:text-gray-300 font-medium">AC Available</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Contact Number</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="e.g. +91 9876543210"
                    value={newHostel.contact}
                    onChange={e => setNewHostel({...newHostel, contact: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Bank Account Number</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Your bank account number"
                      value={newHostel.bankAccountNumber}
                      onChange={e => setNewHostel({...newHostel, bankAccountNumber: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">IFSC Code</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="e.g. SBIN0001234"
                      value={newHostel.ifscCode}
                      onChange={e => setNewHostel({...newHostel, ifscCode: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Amenities (comma separated)</label>
                  <input 
                    type="text" 
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="WiFi, Laundry, Gym, Mess..."
                    onChange={e => setNewHostel({...newHostel, amenities: e.target.value.split(',').map(s => s.trim())})}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Main Hostel Image</label>
                    <div className="flex items-center space-x-4">
                      <label className="flex-1 flex flex-col items-center justify-center h-32 px-4 transition bg-white dark:bg-slate-900 border-2 border-gray-300 border-dashed rounded-2xl appearance-none cursor-pointer hover:border-indigo-400 focus:outline-none">
                        <span className="flex items-center space-x-2">
                          <Plus className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                          <span className="font-medium text-gray-600 dark:text-gray-400">Click to upload main photo</span>
                        </span>
                        <input type="file" name="main_image" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'main')} />
                      </label>
                      {mainImagePreview && (
                        <div className="w-32 h-32 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800">
                          <img src={mainImagePreview} className="w-full h-full object-cover" alt="Preview" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Room & Interior Images</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <label className="flex flex-col items-center justify-center h-24 transition bg-white dark:bg-slate-900 border-2 border-gray-300 border-dashed rounded-2xl appearance-none cursor-pointer hover:border-indigo-400 focus:outline-none">
                        <Plus className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                        <input type="file" name="room_images" className="hidden" accept="image/*" multiple onChange={e => handleFileChange(e, 'rooms')} />
                      </label>
                      {roomImagesPreviews.map((preview, idx) => (
                        <div key={idx} className="h-24 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800 relative group">
                          <img src={preview} className="w-full h-full object-cover" alt={`Room ${idx}`} />
                          <button 
                            type="button"
                            onClick={() => {
                              const newPreviews = [...roomImagesPreviews];
                              newPreviews.splice(idx, 1);
                              setRoomImagesPreviews(newPreviews);
                              setNewHostel(prev => ({ ...prev, images: newPreviews }));
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-bold text-xl hover:bg-indigo-700 shadow-xl dark:shadow-none shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Listing...' : 'List Hostel Now'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MOCK_TIFFIN_SERVICES: TiffinService[] = [
  { 
    id: 'mock1', 
    name: 'Moms Kitchen', 
    description: 'House no 05, Bahadurpur Rd, Unity City Colony, chauraha, Lucknow, ', 
    pricePerMeal: 45, 
    subscriptionPlans: { weekly: 500, monthly: 2000 },
    fullMenu: [
      { day: 'Monday', items: ['Dal', 'Rice', 'Aloo Gobhi', 'Roti'] },
      { day: 'Tuesday', items: ['Rajma', 'Rice', 'Mix Veg', 'Roti'] },
      { day: 'Wednesday', items: ['Kadi', 'Rice', 'Bhindi', 'Roti'] },
      { day: 'Thursday', items: ['Paneer', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Friday', items: ['Chana', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Saturday', items: ['Mix Veg', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Sunday', items: ['Special Thali'] },
    ],
    imageUrl: ' https://lh3.googleusercontent.com/gps-cs-s/AHVAweo-O4YLxuEIf7jr6Sw2MBSGjnouydfebwiFeFRlCD1ArrfAUDRyO2ewX65EK9kEvIdtvPcO_cwb0qHfdaLv5NLQ3ScVZJGDmBuBvvuyzlWbBvEIeHl9_neCebJ60eRwtWY01n1_=s1360-w1360-h1020-rw', 
    contact: ' 9936424572',
    rating: 4.5,
    reviews: [
      { id: 'r1', userId: 'u1', userName: 'Rahul', rating: 5, comment: 'Best home food!', createdAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567897',
    ifscCode: 'SBIN0001234'
  },
  { 
    id: 'mock2', 
    name: 'RL Tiffin Services & Catering for Bulk Order', 
    description: 'e Park 2, C-57, Mahanagar Extension, Lucknow', 
    pricePerMeal: 65, 
    subscriptionPlans: { weekly: 800, monthly: 3400 },
    fullMenu: [
      { day: 'Monday', items: ['Paneer', 'Dal Tadka', 'Jeera Rice'] },
      { day: 'Tuesday', items: ['Chana Masala', 'Rice', 'Roti'] },
      { day: 'Wednesday', items: ['Dal', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Thursday', items: ['Rajma', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Friday', items: ['Kadi', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Saturday', items: ['Paneer', 'Rice', 'Sabzi', 'Roti'] },
      { day: 'Sunday', items: ['Special Thali'] },
    ],
    imageUrl: 'https://lh3.googleusercontent.com/gps-cs-s/AHVAweo95K_hBoIIaUsQaXXGRcpi2pcCjnWfygt7w6EGBF4ATcBqdAJOXaTTkt2ZHAct9p5AVJ41QiZ1ViM3lpnKUY1aRJKPQXbTt1RgSYjxGvG9cscD0HGLFNpGYgK-aLs4eX-LgVlA=s1360-w1360-h1020-rw', 
    contact: '98390 80484',
    rating: 4.2,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567898',
    ifscCode: 'ICIC0001234'
  },
  { 
    id: 'mock3', 
    name: ' Homemade Tiffin Service', 
    description: ' 209, Sector 14, Vikas Nagar, Lucknow', 
    pricePerMeal: 60, 
    subscriptionPlans: { weekly: 700, monthly: 2800 },
    fullMenu: [
       { day: 'Monday', items: ['Aloo Gobhi', 'Dal', 'Roti'] },
  { day: 'Tuesday', items: ['Rajma', 'Rice'] },
  { day: 'Wednesday', items: ['Mix Veg', 'Dal', 'Roti'] },
  { day: 'Thursday', items: ['Chole', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora', 'Rice'] },
  { day: 'Saturday', items: ['Paneer Bhurji', 'Roti'] },
  { day: 'Sunday', items: ['Poori', 'Aloo Sabzi'] }

    ],
    imageUrl: 'https://lh3.googleusercontent.com/gps-cs-s/AHVAwepSGz-Tk5TdcCCunGn3vM3lPKlBP49c323OGzFNDQL-s_g1M1NVL2hCZOwO6598M7B6V2V7LVgWlWJZjFANJs1-4qet1Gea_yVaaQifNIggwD1PSfu76041UiaHSakdGoaIRaPl4w=s1360-w1360-h1020-rw', 
    contact: '94531 30871',
    rating: 4.5,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567899',
    ifscCode: 'HDFC0001234'
  },
  { 
    id: 'mock4', 
    name: 'Awadh Delicious Tiffin Service', 
    description: 'Daliganj,Lucknow', 
    pricePerMeal: 75, 
    subscriptionPlans: { weekly: 1000, monthly: 3800 },
    fullMenu:[
  { day: 'Monday', items: ['Moong Dal', 'Rice', 'Bhindi'] },
  { day: 'Tuesday', items: ['Chana Masala', 'Roti'] },
  { day: 'Wednesday', items: ['Aloo Matar', 'Dal', 'Rice'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi', 'Roti'] },
  { day: 'Saturday', items: ['Paneer Masala', 'Rice'] },
  { day: 'Sunday', items: ['Veg Pulao', 'Raita'] }
],
    imageUrl: 'https://content3.jdmagicbox.com/comp/lucknow/x9/0522px522.x522.221014224250.x2x9/catalogue/awadh-delicious-tiffin-service-lucknow-tiffin-services-yu7s9d96x6.jpg', 
    contact: '9998887771',
    rating: 4.6,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567800',
    ifscCode: 'SBIN0001234'
  },
  { 
    id: 'mock5', 
    name: 'Krishna Tiffin Service', 
    description: 'Plot 203, Hardas Residency, Pancham Khera, Charanbhatta Road, Aashiana, Lucknow', 
    pricePerMeal: 70, 
    subscriptionPlans: { weekly: 900, monthly: 3500 },
    fullMenu:[
  { day: 'Monday', items: ['Masoor Dal', 'Rice', 'Beans'] },
  { day: 'Tuesday', items: ['Chole', 'Roti'] },
  { day: 'Wednesday', items: ['Mix Veg', 'Rice'] },
  { day: 'Thursday', items: ['Kadhi Pakora', 'Rice'] },
  { day: 'Friday', items: ['Paneer Butter Masala', 'Roti'] },
  { day: 'Saturday', items: ['Veg Fried Rice'] },
  { day: 'Sunday', items: ['Poori', 'Chana'] }
],
    imageUrl: 'https://b.zmtcdn.com/data/menus/915/20352915/86b721cf3670c14c00ec448b55ebae3c.jpg', 
    contact: ' 9695457771',
    rating: 4.2,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567801',
    ifscCode: 'ICIC0001234'
  },
  { 
    id: 'mock6', 
    name: 'JAI JALARAM TIFFIN SERVICES', 
    description: 'hazarathganj,Lucknow', 
    pricePerMeal: 65, 
    subscriptionPlans: { weekly: 800, monthly: 3200 },
    fullMenu:[
  { day: 'Monday', items: ['Dal Fry', 'Roti', 'Aloo Fry'] },
  { day: 'Tuesday', items: ['Rajma', 'Rice'] },
  { day: 'Wednesday', items: ['Bhindi', 'Dal', 'Roti'] },
  { day: 'Thursday', items: ['Chole', 'Rice'] },
  { day: 'Friday', items: ['Kadhi', 'Rice'] },
  { day: 'Saturday', items: ['Paneer Curry', 'Roti'] },
  { day: 'Sunday', items: ['Veg Biryani'] }
],
    imageUrl: 'https://content.jdmagicbox.com/v2/comp/mumbai/k4/022pxx22.xx22.240718200911.m6k4/catalogue/jai-jalaram-tiffin-services-dahanukar-wadi-kandivali-west-mumbai-tiffin-services-for-veg-food-2udqxbhezz.jpg', 
    contact: '9778887771',
    rating: 4.8,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567802',
    ifscCode: 'SBIN0001234'
  },
  { 
    id: 'mock7', 
    name: 'Narayan Tiffin Service', 
    description: 'Civil lines ,sultanpur', 
    pricePerMeal: 50, 
    subscriptionPlans: { weekly: 700, monthly: 2800 },
    fullMenu:[
  { day: 'Monday', items: ['Toor Dal', 'Rice', 'Cabbage'] },
  { day: 'Tuesday', items: ['Chana Masala', 'Roti'] },
  { day: 'Wednesday', items: ['Aloo Gobhi', 'Rice'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi', 'Roti'] },
  { day: 'Saturday', items: ['Paneer Bhurji', 'Rice'] },
  { day: 'Sunday', items: ['Poori', 'Sabzi'] }
],
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSzTNOkkpPai5PG34h4U8Yf6wqfhJzgmp5ljw&s', 
    contact: '9695818104',
    rating: 3.8,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567803',
    ifscCode: 'ICIC0001234'
  },
  { 
    id: 'mock8', 
    name: 'moms Bites', 
    description: 'Vivek nagar, sultanpur', 
    pricePerMeal: 50, 
    subscriptionPlans: { weekly: 600, monthly: 3000 },
    fullMenu: [
  { day: 'Monday', items: ['Moong Dal', 'Roti', 'Mix Veg'] },
  { day: 'Tuesday', items: ['Chole', 'Rice'] },
  { day: 'Wednesday', items: ['Aloo Matar', 'Roti'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora', 'Rice'] },
  { day: 'Saturday', items: ['Paneer Masala', 'Roti'] },
  { day: 'Sunday', items: ['Veg Pulao'] }
],
    imageUrl: 'https://images.jdmagicbox.com/comp/remote/k8/9999p5362.5362.160408144431.j2k8/menu/narayan-tiffin-service-civil-line-sultanpur-tiffin-services-for-veg-food-i20zoca.jpg', 
    contact: ' 8090404512',
    rating: 4.5,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567804',
    ifscCode: 'HDFC0001234'
  },
  { 
    id: 'mock9', 
    name: 'Kanchan Tiffin Services', 
    description: 'Ausanganj,Varanasi', 
    pricePerMeal: 55, 
    subscriptionPlans: { weekly: 700, monthly: 3200 },
    fullMenu: [
  { day: 'Monday', items: ['Moong Dal', 'Roti', 'Mix Veg'] },
  { day: 'Tuesday', items: ['Chole', 'Rice'] },
  { day: 'Wednesday', items: ['Aloo Matar', 'Roti'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora', 'Rice'] },
  { day: 'Saturday', items: ['Paneer Masala', 'Roti'] },
  { day: 'Sunday', items: ['Veg Pulao'] }
],
    imageUrl: 'https://picsum.photos/seed/food3/400/300', 
    contact: ' 7756552310',
    rating: 4.4,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567805',
    ifscCode: 'ICIC0001234'
  },
  { 
    id: 'mock10', 
    name: 'Dishan Tiffin Services', 
    description: 'Bhikharipur,Varanasi', 
    pricePerMeal:  50, 
    subscriptionPlans: { weekly: 650, monthly: 3000 },
    fullMenu:[
  { day: 'Monday', items: ['Masoor Dal', 'Rice', 'Bhindi'] },
  { day: 'Tuesday', items: ['Rajma', 'Roti'] },
  { day: 'Wednesday', items: ['Mix Veg', 'Rice'] },
  { day: 'Thursday', items: ['Chole', 'Rice'] },
  { day: 'Friday', items: ['Kadhi', 'Roti'] },
  { day: 'Saturday', items: ['Paneer Butter Masala'] },
  { day: 'Sunday', items: ['Poori', 'Aloo'] }
],
    imageUrl: ' https://content.jdmagicbox.com/comp/varanasi/q1/0542px542.x542.230406120548.p8q1/catalogue/dishan-tiffin-services-bhikharipur-varanasi-tiffin-services-sckqkxifur.jpg', 
    contact: '8585074241',
    rating: 4.1,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567806',
    ifscCode: 'SBIN0001234'
  },
  { 
    id: 'mock11', 
    name: 'Swaad sewa Tiffin service', 
    description: ' lakhraw ,Varanasi', 
    pricePerMeal: 60, 
    subscriptionPlans: { weekly: 750, monthly:3300  },
    fullMenu: [
  { day: 'Monday', items: ['Dal Tadka', 'Rice', 'Beans'] },
  { day: 'Tuesday', items: ['Chana Masala', 'Roti'] },
  { day: 'Wednesday', items: ['Aloo Gobhi', 'Rice'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora', 'Rice'] },
  { day: 'Saturday', items: ['Paneer Curry', 'Roti'] },
  { day: 'Sunday', items: ['Veg Biryani'] }
],
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS18W_pquj5d2M4IOlXAOQifdUSaUjul6WvcA&s', 
    contact: ' 8181081042',
    rating: 4.6,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567807',
    ifscCode: 'ICIC0001234'
  },
  { 
    id: 'mock12', 
    name: 'Vishwas Tiffin service', 
    description: 'Purana Ramnagar ,Varanasi', 
    pricePerMeal: 70, 
    subscriptionPlans: { weekly: 900, monthly: 3500 },
    fullMenu: [
  { day: 'Monday', items: ['Toor Dal', 'Rice', 'Cabbage'] },
  { day: 'Tuesday', items: ['Rajma', 'Roti'] },
  { day: 'Wednesday', items: ['Bhindi', 'Rice'] },
  { day: 'Thursday', items: ['Chole', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora'] },
  { day: 'Saturday', items: ['Paneer Masala', 'Roti'] },
  { day: 'Sunday', items: ['Veg Pulao'] }
],
    imageUrl: 'https://dookan24.in/uploads/companies/1761837169-1.webp', 
    contact: ' 7380587055',
    rating: 4.3,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567808',
    ifscCode: 'SBIN0001234'
  },
  { 
    id: 'mock13', 
    name: 'Ladali Tiffin Service', 
    description: 'phaphamau,prayagraj', 
    pricePerMeal: 650, 
    subscriptionPlans: { weekly: 750, monthly: 3200 },
    fullMenu:[
  { day: 'Monday', items: ['Masoor Dal', 'Rice', 'Mix Veg'] },
  { day: 'Tuesday', items: ['Chana Masala', 'Roti'] },
  { day: 'Wednesday', items: ['Aloo Matar', 'Rice'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi', 'Roti'] },
  { day: 'Saturday', items: ['Paneer Butter Masala'] },
  { day: 'Sunday', items: ['Poori', 'Chana'] }
],
    imageUrl: 'https://content.jdmagicbox.com/comp/allahabad/s3/0532px532.x532.230912131755.b6s3/catalogue/ladali-tiffin-service-phaphamau-allahabad-tiffin-services-148m92i6up.jpg', 
    contact: '9957598121',
    rating: 4.0,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567809',
    ifscCode: 'HDFC0001234'
  },
  { 
    id: 'mock14', 
    name: 'shri tiffin services', 
    description: 'prayagraj ', 
    pricePerMeal: 60, 
    subscriptionPlans: { weekly: 800, monthly: 3200 },
    fullMenu: [
  { day: 'Monday', items: ['Dal Fry', 'Rice', 'Beans'] },
  { day: 'Tuesday', items: ['Chole', 'Roti'] },
  { day: 'Wednesday', items: ['Mix Veg', 'Rice'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora'] },
  { day: 'Saturday', items: ['Paneer Curry'] },
  { day: 'Sunday', items: ['Veg Biryani'] }
],
    imageUrl: 'https://5.imimg.com/data5/ANDROID/Default/2022/7/TS/OZ/SW/156193425/prod-20220709-164654724139792091582282-jpg-500x500.jpg', 
    contact: '9687235471',
    rating: 4.2,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567810',
    ifscCode: 'SBIN0001234'
  },
  { 
    id: 'mock15', 
    name: 'Healthy Bites', 
    description: 'bai ka bagh,prayagraj', 
    pricePerMeal: 55, 
    subscriptionPlans: { weekly:750, monthly: 2500 },
    fullMenu: [
  { day: 'Monday', items: ['Masoor Dal', 'Rice', 'Aloo Fry'] },
  { day: 'Tuesday', items: ['Chana Masala', 'Roti'] },
  { day: 'Wednesday', items: ['Mix Veg', 'Rice'] },
  { day: 'Thursday', items: ['Rajma', 'Rice'] },
  { day: 'Friday', items: ['Kadhi Pakora'] },
  { day: 'Saturday', items: ['Paneer Butter Masala'] },
  { day: 'Sunday', items: ['Special Thali'] }
],
    imageUrl: 'https://5.imimg.com/data5/NC/KN/FU/SELLER-74179120/tiff-jpg.jpg', 
    contact: '9222354897',
    rating: 4.4,
    reviews: [],
    createdAt: new Date().toISOString(),
    bankAccountNumber: '1234567811',
    ifscCode: 'ICIC0001234'
  },
];

const TiffinMate = ({ user, initiatePayment, paymentStatus }: { 
  user: FirebaseUser | null, 
  initiatePayment: (context: {
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  }) => Promise<void>,
  paymentStatus: 'idle' | 'processing' | 'success'
}) => {
  const [services, setServices] = useState<TiffinService[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedService, setSelectedService] = useState<TiffinService | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceImagePreview, setServiceImagePreview] = useState<string | null>(null);
  
  const initialWeeklyMenu = [
    { day: 'Monday', items: '' },
    { day: 'Tuesday', items: '' },
    { day: 'Wednesday', items: '' },
    { day: 'Thursday', items: '' },
    { day: 'Friday', items: '' },
    { day: 'Saturday', items: '' },
    { day: 'Sunday', items: '' },
  ];

  const [newService, setNewService] = useState({
    name: '',
    description: '',
    pricePerMeal: '',
    weeklyPrice: '',
    monthlyPrice: '',
    contact: '',
    fullMenu: initialWeeklyMenu,
    bankAccountNumber: '',
    ifscCode: ''
  });

  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });

  useEffect(() => {
    const q = query(collection(db, 'tiffinServices'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const serviceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiffinService));
      const approvedServices = serviceData.filter(s => !s.status || s.status === 'approved');
      
      // Merge Firestore data with hardcoded mock data
      setServices([...approvedServices, ...MOCK_TIFFIN_SERVICES]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setServiceImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'tiffinServices'), {
        ownerId: user.uid,
        name: newService.name,
        description: newService.description,
        pricePerMeal: Number(newService.pricePerMeal),
        subscriptionPlans: {
          weekly: Number(newService.weeklyPrice),
          monthly: Number(newService.monthlyPrice),
        },
        fullMenu: newService.fullMenu.map(day => ({
          day: day.day,
          items: day.items.split(',').map(i => i.trim()).filter(i => i !== '')
        })),
        imageUrl: serviceImagePreview || `https://picsum.photos/seed/${newService.name}/400/300`,
        contact: newService.contact,
        rating: 5,
        reviews: [],
        createdAt: new Date().toISOString(),
        status: 'pending',
        bankAccountNumber: newService.bankAccountNumber,
        ifscCode: newService.ifscCode
      });
      await sendNotification('ADMIN', 'New Tiffin Service', `${user.displayName} has added a tiffin service: ${newService.name}`, 'info', '/admin');
      setIsAdding(false);
      setNewService({ 
        name: '', 
        description: '', 
        pricePerMeal: '', 
        weeklyPrice: '', 
        monthlyPrice: '', 
        contact: '', 
        fullMenu: initialWeeklyMenu,
        bankAccountNumber: '',
        ifscCode: ''
      });
      setServiceImagePreview(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tiffinServices');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddReview = async (serviceId: string) => {
    if (!user) return;
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    const review: Review = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      userName: user.displayName || 'Anonymous',
      rating: newReview.rating,
      comment: newReview.comment,
      createdAt: new Date().toISOString()
    };

    const updatedReviews = [...service.reviews, review];
    const newRating = updatedReviews.reduce((acc, r) => acc + r.rating, 0) / updatedReviews.length;

    try {
      await setDoc(doc(db, 'tiffinServices', serviceId), {
        ...service,
        reviews: updatedReviews,
        rating: Number(newRating.toFixed(1))
      });
      setNewReview({ rating: 5, comment: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tiffinServices/${serviceId}`);
    }
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pt-24 pb-12 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-4">
          <Link to="/" className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors"><ArrowLeft size={24} /></Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">TiffinMate</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search services..." 
              className="pl-12 pr-6 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-64"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => user ? setIsAdding(true) : alert('Please sign in to add a service')}
            className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-orange-700 transition-all flex items-center justify-center shadow-lg dark:shadow-none shadow-orange-100"
          >
            <Plus size={20} className="mr-2" /> List Service
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredServices.map(s => (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-slate-800 overflow-hidden hover:shadow-lg dark:shadow-none transition-all flex flex-col">
              <div className="relative">
                <img src={s.imageUrl} className="w-full h-48 object-cover" alt="" />
                <div className="absolute top-4 right-4 bg-white dark:bg-slate-900/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center space-x-1 shadow-sm dark:shadow-none">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  <span className="text-sm font-bold">{s.rating}</span>
                </div>
                {!s.ownerId && (
                  <div className="absolute top-4 left-4 bg-gray-900/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm pointer-events-none">
                    <span className="text-[10px] md:text-xs font-bold text-white tracking-widest uppercase">Demo</span>
                  </div>
                )}
                {s.ownerId && s.status === 'approved' && (
                  <div className="absolute top-4 left-4 bg-green-500/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center shadow-sm pointer-events-none">
                    <CheckCircle size={14} className="text-white mr-1" />
                    <span className="text-[10px] md:text-xs font-bold text-white uppercase">Verified</span>
                  </div>
                )}
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{s.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 line-clamp-2">{s.description}</p>
                
                <div className="bg-orange-50 p-4 rounded-2xl mb-6">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Weekly Menu</p>
                    <button 
                      onClick={() => { setSelectedService(s); setShowMenu(true); }}
                      className="text-[10px] text-orange-600 font-bold uppercase hover:underline"
                    >
                      View Full Menu
                    </button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {s.fullMenu.slice(0, 2).map((day, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="font-bold text-orange-700">{day.day}:</span>
                        <span className="text-orange-600 truncate ml-2">{day.items.join(', ')}</span>
                      </div>
                    ))}
                    {s.fullMenu.length > 2 && <p className="text-[10px] text-orange-400 italic">And more...</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Weekly</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">₹{s.subscriptionPlans.weekly}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Monthly</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">₹{s.subscriptionPlans.monthly}</p>
                  </div>
                </div>

                <div className="mt-auto flex gap-3">
                  <button 
                    onClick={() => { setSelectedService(s); setShowSubscription(true); }}
                    className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-colors shadow-lg dark:shadow-none shadow-orange-100"
                  >
                    Subscribe
                  </button>
                  <button 
                    onClick={() => { setSelectedService(s); setShowReviews(true); }}
                    className="px-4 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-100 dark:bg-slate-700/50 transition-colors border border-gray-100 dark:border-slate-800"
                  >
                    Reviews
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Service Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdding(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-8">List Your Tiffin Service</h2>
              <form onSubmit={handleAddService} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Service Name</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.name} onChange={e => setNewService({...newService, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Contact Number</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.contact} onChange={e => setNewService({...newService, contact: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Description</label>
                  <textarea required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 h-24" value={newService.description} onChange={e => setNewService({...newService, description: e.target.value})} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Per Meal (₹)</label>
                    <input type="number" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.pricePerMeal} onChange={e => setNewService({...newService, pricePerMeal: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Weekly (₹)</label>
                    <input type="number" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.weeklyPrice} onChange={e => setNewService({...newService, weeklyPrice: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Monthly (₹)</label>
                    <input type="number" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.monthlyPrice} onChange={e => setNewService({...newService, monthlyPrice: e.target.value})} />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Bank Account Number</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.bankAccountNumber} onChange={e => setNewService({...newService, bankAccountNumber: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">IFSC Code</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500" value={newService.ifscCode} onChange={e => setNewService({...newService, ifscCode: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold text-gray-400 uppercase">Weekly Menu (Items separated by comma)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {newService.fullMenu.map((day, idx) => (
                      <div key={day.day} className="space-y-1">
                        <label className="text-[10px] font-bold text-orange-600 uppercase">{day.day}</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Dal, Rice, Roti" 
                          className="w-full p-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                          value={day.items}
                          onChange={e => {
                            const updatedMenu = [...newService.fullMenu];
                            updatedMenu[idx].items = e.target.value;
                            setNewService({...newService, fullMenu: updatedMenu});
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Upload Pamphlet / Photo</label>
                  <div className="flex items-center space-x-4">
                    <label className="flex flex-col items-center justify-center w-32 h-32 transition bg-white dark:bg-slate-900 border-2 border-gray-300 border-dashed rounded-2xl appearance-none cursor-pointer hover:border-orange-400 focus:outline-none">
                      <Plus className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-2">Add Photo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                    {serviceImagePreview && (
                      <div className="w-32 h-32 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800 relative group">
                        <img src={serviceImagePreview} className="w-full h-full object-cover" alt="Preview" />
                        <button 
                          type="button"
                          onClick={() => setServiceImagePreview(null)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-orange-700 transition-all shadow-xl dark:shadow-none shadow-orange-100 disabled:opacity-50"
                >
                  {isSubmitting ? 'Listing...' : 'List Service'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Menu Modal */}
      <AnimatePresence>
        {showMenu && selectedService && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMenu(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl overflow-y-auto max-h-[80vh]">
              <h2 className="text-2xl font-bold mb-6">Weekly Menu - {selectedService.name}</h2>
              <div className="space-y-6">
                {selectedService.fullMenu.map((dayMenu, idx) => (
                  <div key={idx} className="border-b border-gray-50 pb-4 last:border-0">
                    <h4 className="font-bold text-orange-600 mb-2">{dayMenu.day}</h4>
                    <div className="flex flex-wrap gap-2">
                      {dayMenu.items.map((item, i) => (
                        <span key={i} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 px-3 py-1 rounded-lg">{item}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reviews Modal */}
      <AnimatePresence>
        {showReviews && selectedService && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReviews(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl overflow-y-auto max-h-[80vh]">
              <h2 className="text-2xl font-bold mb-6">Reviews - {selectedService.name}</h2>
              
              {user && (
                <div className="mb-8 p-6 bg-gray-50 dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-slate-800">
                  <h4 className="font-bold mb-4">Write a Review</h4>
                  <div className="flex space-x-2 mb-4">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => setNewReview({...newReview, rating: star})}>
                        <Star size={24} className={star <= newReview.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"} />
                      </button>
                    ))}
                  </div>
                  <textarea 
                    placeholder="Your experience..." 
                    className="w-full p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 h-24 mb-4"
                    value={newReview.comment}
                    onChange={e => setNewReview({...newReview, comment: e.target.value})}
                  />
                  <button 
                    onClick={() => handleAddReview(selectedService.id)}
                    className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-all"
                  >
                    Submit Review
                  </button>
                </div>
              )}

              <div className="space-y-6">
                {selectedService.reviews.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No reviews yet. Be the first!</p>
                ) : (
                  selectedService.reviews.map(r => (
                    <div key={r.id} className="border-b border-gray-50 pb-4 last:border-0">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-xs font-bold text-orange-600">
                            {r.userName[0]}
                          </div>
                          <span className="font-bold text-sm">{r.userName}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Star size={12} className="text-yellow-500 fill-yellow-500" />
                          <span className="text-xs font-bold">{r.rating}</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{r.comment}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subscription Modal */}
      <AnimatePresence>
        {showSubscription && selectedService && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !paymentStatus.includes('processing') && setShowSubscription(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl text-center">
              {paymentStatus === 'idle' && (
                <>
                  <div className="w-20 h-20 bg-orange-50 rounded-3xl flex items-center justify-center text-orange-600 mx-auto mb-6">
                    <ShoppingBag size={40} />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Choose Subscription</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-8">Subscribe to <span className="font-bold text-gray-900 dark:text-gray-100">{selectedService.name}</span></p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <button 
                      onClick={() => initiatePayment({
                        type: 'tiffin_subscription',
                        amount: selectedService.subscriptionPlans.weekly,
                        item: selectedService,
                        description: `Weekly Subscription for ${selectedService.name}`
                      })}
                      className="p-6 bg-gray-50 dark:bg-slate-800 rounded-3xl border-2 border-transparent hover:border-orange-500 transition-all text-left group"
                    >
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Weekly</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-orange-600">₹{selectedService.subscriptionPlans.weekly}</p>
                    </button>
                    <button 
                      onClick={() => initiatePayment({
                        type: 'tiffin_subscription',
                        amount: selectedService.subscriptionPlans.monthly,
                        item: selectedService,
                        description: `Monthly Subscription for ${selectedService.name}`
                      })}
                      className="p-6 bg-gray-50 dark:bg-slate-800 rounded-3xl border-2 border-transparent hover:border-orange-500 transition-all text-left group"
                    >
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Monthly</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-orange-600">₹{selectedService.subscriptionPlans.monthly}</p>
                    </button>
                  </div>

                  <button onClick={() => setShowSubscription(false)} className="text-gray-400 font-bold hover:text-gray-600 dark:text-gray-400">Cancel</button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MOCK_MARKET_ITEMS: MarketItem[] = [
  {
    id: 'mock-1',
    sellerId: 'system',
    sellerName: 'Admin',
    title: 'Engineering Physics Textbook',
    description: 'Latest edition, like new.',
    price: 450,
    category: 'Books',
    imageUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400',
    createdAt: new Date().toISOString(),
    availability: 'Available',
    bankAccountNumber: '1234567812',
    ifscCode: 'SBIN0001234'
  },
  {
    id: 'mock-2',
    sellerId: 'system',
    sellerName: 'Admin',
    title: 'Scientific Calculator',
    description: 'Casio FX-991EX, perfect for exams.',
    price: 800,
    category: 'Electronics',
    imageUrl: 'https://images.unsplash.com/photo-1574607383476-f517f220d308?auto=format&fit=crop&q=80&w=400',
    createdAt: new Date().toISOString(),
    availability: 'Available',
    bankAccountNumber: '1234567813',
    ifscCode: 'ICIC0001234'
  }
];

const StudentSwap = ({ user, initiatePayment }: { 
  user: FirebaseUser | null, 
  initiatePayment: (context: {
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  }) => Promise<void>
}) => {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({ title: '', price: '', category: 'Electronics', description: '', bankAccountNumber: '', ifscCode: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  useEffect(() => {
    const q = query(collection(db, 'marketItems'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketItem));
      const approvedItems = itemData.filter(i => !i.status || i.status === 'approved');
      // Merge Firestore data with mock data to ensure something is always visible
      setItems([...approvedItems, ...MOCK_MARKET_ITEMS]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setItemImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'marketItems'), {
        sellerId: user.uid,
        sellerName: user.displayName,
        title: newItem.title,
        price: Number(newItem.price),
        category: newItem.category,
        description: newItem.description,
        imageUrl: itemImagePreview || `https://picsum.photos/seed/${newItem.title}/400/300`,
        createdAt: new Date().toISOString(),
        availability: 'Available',
        status: 'pending',
        bankAccountNumber: newItem.bankAccountNumber,
        ifscCode: newItem.ifscCode
      });
      await sendNotification('ADMIN', 'New Marketplace Item', `${user.displayName} is selling: ${newItem.title}`, 'info', '/admin');
      setIsAdding(false);
      setNewItem({ title: '', price: '', category: 'Electronics', description: '', bankAccountNumber: '', ifscCode: '' });
      setItemImagePreview(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'marketItems');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'marketItems', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `marketItems/${id}`);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['All', 'Electronics', 'Books', 'Furniture', 'Other'];

  return (
    <div className="pt-24 pb-12 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-4">
          <Link to="/" className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors"><ArrowLeft size={24} /></Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">StudentSwap</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search items..." 
              className="pl-12 pr-6 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => user ? setIsAdding(true) : alert('Please sign in to sell items')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center shadow-lg dark:shadow-none shadow-indigo-100"
          >
            <Plus size={20} className="mr-2" /> Sell Item
          </button>
        </div>
      </div>

      <div className="flex overflow-x-auto pb-4 mb-8 no-scrollbar gap-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "px-6 py-2 rounded-full font-bold text-sm transition-all whitespace-nowrap",
              selectedCategory === cat 
                ? "bg-indigo-600 text-white shadow-lg dark:shadow-none shadow-indigo-100" 
                : "bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:bg-slate-700/50"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdding(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-8">List Your Item</h2>
              <form onSubmit={handleAddItem} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Item Title</label>
                  <input type="text" placeholder="e.g. Engineering Physics Textbook" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.title} onChange={e => setNewItem({...newItem, title: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Price (₹)</label>
                    <input type="number" placeholder="Price" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Category</label>
                    <select className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                      {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Description</label>
                  <textarea placeholder="Tell us more about the item..." className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-32" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Bank Account Number</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.bankAccountNumber} onChange={e => setNewItem({...newItem, bankAccountNumber: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">IFSC Code</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.ifscCode} onChange={e => setNewItem({...newItem, ifscCode: e.target.value})} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Item Image</label>
                  <div className="flex items-center space-x-4">
                    <label className="flex flex-col items-center justify-center w-32 h-32 transition bg-white dark:bg-slate-900 border-2 border-gray-300 border-dashed rounded-2xl appearance-none cursor-pointer hover:border-indigo-400 focus:outline-none">
                      <Plus className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-2">Add Photo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                    {itemImagePreview && (
                      <div className="w-32 h-32 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800 relative group">
                        <img src={itemImagePreview} className="w-full h-full object-cover" alt="Preview" />
                        <button 
                          type="button"
                          onClick={() => setItemImagePreview(null)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl dark:shadow-none shadow-indigo-100 disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Post Item'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 overflow-hidden hover:shadow-lg dark:shadow-none transition-all flex flex-col relative">
              {item.availability === 'Sold' ? (
                <div className="absolute top-4 left-4 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Sold
                </div>
              ) : (
                <div className="absolute top-4 left-4 z-10 bg-green-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Available
                </div>
              )}
              {item.sellerId === 'system' && (
                <div className="absolute top-4 right-4 z-10 bg-gray-900/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm pointer-events-none">
                  <span className="text-[10px] md:text-xs font-bold text-white tracking-widest uppercase">Demo</span>
                </div>
              )}
              {item.sellerId !== 'system' && item.status === 'approved' && (
                <div className="absolute top-4 right-4 z-10 bg-green-500/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center shadow-sm pointer-events-none">
                  <CheckCircle size={14} className="text-white mr-1" />
                  <span className="text-[10px] md:text-xs font-bold text-white uppercase">Verified</span>
                </div>
              )}
              <img src={item.imageUrl} className="w-full h-40 object-cover" alt="" />
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-1">{item.title}</h3>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{item.category}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{formatTimeAgo(item.createdAt)}</p>
                </div>
                <p className="text-lg font-bold text-indigo-600 mb-4">₹{item.price}</p>
                
                <div className="mt-auto pt-4 border-t border-gray-50 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-gray-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        {item.sellerName?.[0]}
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{item.sellerName}</span>
                    </div>
                    {user?.uid === item.sellerId && (
                      <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  
                  {item.availability === 'Available' && (
                    <button 
                      onClick={() => initiatePayment({
                        type: 'market_sale',
                        amount: item.price,
                        item: item,
                        description: `Purchase of ${item.title}`
                      })}
                      className="w-full bg-indigo-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
                    >
                      {user?.uid === item.sellerId ? 'Buy Now (Test)' : 'Buy Now'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const JobFinder = ({ user, initiatePayment }: { 
  user: FirebaseUser | null, 
  initiatePayment: (context: {
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  }) => Promise<void>
}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newJob, setNewJob] = useState({
    title: '',
    company: '',
    location: '',
    salary: '',
    type: 'Part-time' as 'Part-time' | 'Full-time' | 'Internship',
    description: '',
    contact: '',
    lastDate: '',
    eligibility: ''
  });

  const MOCK_JOBS: Job[] = [
    { 
      id: 'mock-1', 
      title: 'Content Writer', 
      company: 'EduTech Solutions', 
      location: 'Remote / Near Campus', 
      salary: '₹5000 - ₹8000 / month', 
      type: 'Part-time', 
      description: 'Write educational content for our blog.', 
      createdAt: new Date().toISOString(),
      contact: 'hr@edutech.com',
      lastDate: '2026-04-15',
      eligibility: 'Excellent writing skills, any degree.'
    },
    { 
      id: 'mock-2', 
      title: 'Campus Ambassador', 
      company: 'Tech Brand X', 
      location: 'University Campus', 
      salary: 'Performance Based', 
      type: 'Internship', 
      description: 'Promote our products among students.', 
      createdAt: new Date().toISOString(),
      contact: 'campus@techbrandx.com',
      lastDate: '2026-04-10',
      eligibility: 'Current university student with good communication.'
    },
    { 
      id: 'mock-3', 
      title: 'Delivery Partner', 
      company: 'QuickBite', 
      location: 'Local Area', 
      salary: '₹12000 / month', 
      type: 'Part-time', 
      description: 'Deliver food orders in the evening.', 
      createdAt: new Date().toISOString(),
      contact: 'jobs@quickbite.com',
      lastDate: '2026-05-01',
      eligibility: 'Must have a two-wheeler and valid license.'
    },
  ];

  useEffect(() => {
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      const approvedJobs = jobData.filter(j => !j.status || j.status === 'approved');
      setJobs([...approvedJobs, ...MOCK_JOBS]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'jobs'), {
        ...newJob,
        createdAt: new Date().toISOString(),
        postedBy: user.uid,
        status: 'pending'
      });
      await sendNotification('ADMIN', 'New Job Vacancy', `${user.displayName} posted a job: ${newJob.title}`, 'info', '/admin');
      setIsAdding(false);
      setNewJob({
        title: '',
        company: '',
        location: '',
        salary: '',
        type: 'Part-time',
        description: '',
        contact: '',
        lastDate: '',
        eligibility: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'jobs');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredJobs = jobs.filter(j => 
    j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pt-24 pb-12 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-4">
          <Link to="/" className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors"><ArrowLeft size={24} /></Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Job Finder</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search jobs or location..." 
              className="pl-12 pr-6 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-64"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => user ? setIsAdding(true) : alert('Please sign in to post a job')}
            className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-purple-700 transition-all flex items-center justify-center shadow-lg dark:shadow-none shadow-purple-100"
          >
            <Plus size={20} className="mr-2" /> Post a Job
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="space-y-6">
          {filteredJobs.map(j => (
            <div key={j.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-gray-100 dark:border-slate-800 hover:shadow-lg dark:shadow-none transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start space-x-6">
                <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Briefcase size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{j.title}</h3>
                  <p className="text-purple-600 font-semibold mb-2">{j.company}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center"><MapPin size={14} className="mr-1" /> {j.location}</span>
                    <span className="flex items-center font-bold text-gray-700 dark:text-gray-300">₹ {j.salary}</span>
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-md font-bold text-[10px] uppercase tracking-wider">{j.type}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedJob(j)}
                className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all"
              >
                View Details
              </button>
            </div>
          ))}
          {filteredJobs.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-500 dark:text-gray-400">No jobs found matching your search.</p>
            </div>
          )}
        </div>
      )}

      {/* Post Job Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdding(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">Post a New Job</h2>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors"><X size={24} /></button>
              </div>
              <form onSubmit={handleAddJob} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Job Title</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} placeholder="e.g. Content Writer" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Company Name</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.company} onChange={e => setNewJob({...newJob, company: e.target.value})} placeholder="e.g. EduTech Solutions" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Location</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.location} onChange={e => setNewJob({...newJob, location: e.target.value})} placeholder="e.g. Remote / Near Campus" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Salary Range</label>
                    <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.salary} onChange={e => setNewJob({...newJob, salary: e.target.value})} placeholder="e.g. ₹5000 - ₹8000 / month" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Job Type</label>
                    <select className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.type} onChange={e => setNewJob({...newJob, type: e.target.value as any})}>
                      <option value="Part-time">Part-time</option>
                      <option value="Full-time">Full-time</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Last Date to Apply</label>
                    <input type="date" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.lastDate} onChange={e => setNewJob({...newJob, lastDate: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Contact Email/Link</label>
                  <input type="text" required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" value={newJob.contact} onChange={e => setNewJob({...newJob, contact: e.target.value})} placeholder="e.g. hr@edutech.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Eligibility</label>
                  <textarea required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 h-24" value={newJob.eligibility} onChange={e => setNewJob({...newJob, eligibility: e.target.value})} placeholder="e.g. Excellent writing skills, any degree." />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Job Description</label>
                  <textarea required className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 h-32" value={newJob.description} onChange={e => setNewJob({...newJob, description: e.target.value})} placeholder="Describe the role and responsibilities..." />
                </div>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-purple-700 transition-all shadow-xl dark:shadow-none shadow-purple-100 disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Post Job Listing'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedJob && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedJob(null)} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }} 
              className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] p-10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
                    <Briefcase size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedJob.title}</h2>
                    <p className="text-purple-600 font-bold">{selectedJob.company}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedJob(null)} className="p-2 hover:bg-gray-100 dark:bg-slate-700/50 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</label>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">{selectedJob.location}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Salary</label>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">{selectedJob.salary}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Job Type</label>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">{selectedJob.type}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date of Listing</label>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">{new Date(selectedJob.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Date for Applying</label>
                    <p className="text-red-500 font-bold">{new Date(selectedJob.lastDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contact Information</label>
                    <p className="text-indigo-600 font-bold">{selectedJob.contact}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Eligibility</label>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-800">{selectedJob.eligibility}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Job Description</label>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{selectedJob.description}</p>
                </div>
              </div>

              <button 
                onClick={() => window.location.href = `mailto:${selectedJob.contact}`}
                className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-purple-700 transition-all shadow-xl dark:shadow-none shadow-purple-100"
              >
                Apply Now
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AuthPage = () => {
  const navigate = useNavigate();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setError(null);

    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: new Date().toISOString()
        });
      }
      navigate('/');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/cancelled-popup-request') {
        setError('Login was cancelled. Please try again.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Login popup was closed. Please try again.');
      } else {
        setError('An error occurred during login. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-800 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-12 rounded-[3rem] shadow-2xl text-center border border-gray-100 dark:border-slate-800">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-10">
          <Home size={40} />
        </div>
        <h1 className="text-3xl font-bold mb-4">Welcome to Student Solution</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Sign in to access all student utilities and connect with your community.</p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <button 
          onClick={handleLogin} 
          disabled={isLoggingIn}
          className={cn(
            "w-full flex items-center justify-center space-x-4 bg-white dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-800 py-4 rounded-2xl font-bold transition-all",
            isLoggingIn ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-600"
          )}
        >
          {isLoggingIn ? (
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="" />
          )}
          <span>{isLoggingIn ? 'Signing in...' : 'Continue with Google'}</span>
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportAmount, setSupportAmount] = useState('100');
  const [paymentContext, setPaymentContext] = useState<{
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  } | null>(null);

  const initiatePayment = async (context: {
    type: 'listing_fee' | 'hostel_rent' | 'tiffin_subscription' | 'market_sale' | 'donation';
    amount: number;
    item: any;
    itemType?: 'hostel' | 'tiffin' | 'job' | 'market';
    description: string;
  }) => {
    setPaymentContext(context);
    setPaymentStatus('idle');
    setShowPaymentModal(true);
  };

  const handlePayment = async () => {
    if (!user || !paymentContext) return;
    
    setPaymentStatus('processing');
    
    try {
      let transfers = [];
      let vendorAccountId = null;

      if (paymentContext.type !== 'listing_fee' && paymentContext.type !== 'donation') {
        const vendorType = paymentContext.type === 'hostel_rent' ? 'hostel' : 
                          paymentContext.type === 'tiffin_subscription' ? 'tiffin' : 'market';
        vendorAccountId = await getOrCreateRazorpayAccount(paymentContext.item, vendorType, user);
        
        const commissionRate = paymentContext.type === 'market_sale' ? 0.05 : 0.1;
        const vendorAmount = paymentContext.amount * (1 - commissionRate);
        
        if (vendorAccountId && !vendorAccountId.startsWith('acc_demo') && !vendorAccountId.startsWith('acc_mock')) {
          transfers.push({
            account: vendorAccountId,
            amount: vendorAmount,
            currency: 'INR'
          });
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/payment/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: paymentContext.amount,
          currency: 'INR',
          receipt: `rcpt_${Date.now()}`,
          notes: {
            type: paymentContext.type,
            itemId: paymentContext.item.id,
            userId: user.uid,
            ...(paymentContext.itemType && { itemType: paymentContext.itemType })
          },
          transfers: transfers.length > 0 ? transfers : undefined
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Order creation failed: ${response.status} ${errorText}`);
      }

      const order = await response.json();
      console.log('Order created response:', order);
      
      if (!order.id) {
        console.error('Order ID missing in response:', order);
        throw new Error('Order creation failed: No ID returned from server. Response: ' + JSON.stringify(order));
      }

      // If it's a mock order, simulate success after a delay
      if (order.id.startsWith('order_mock_')) {
        console.log('Mock order detected. Simulating successful payment...');
        setTimeout(() => {
          setPaymentStatus('success');
          // Simulate the handler callback
          const mockResponse = {
            razorpay_order_id: order.id,
            razorpay_payment_id: 'pay_mock_' + Date.now(),
            razorpay_signature: 'mock_sig'
          };
          
          // Call the post-payment logic directly for mock mode
          (async () => {
            const isMockId = (id: string) => !id || id.startsWith('mock') || /^\d+$/.test(id);
            
            if (paymentContext.type === 'listing_fee') {
              if (!isMockId(paymentContext.item.id)) {
                const collectionName = paymentContext.itemType === 'hostel' ? 'hostels' : 
                                      paymentContext.itemType === 'tiffin' ? 'tiffinServices' : 'jobs';
                try {
                  await updateDoc(doc(db, collectionName, paymentContext.item.id), {
                    listingFeePaid: true
                  });
                } catch (err) {
                  console.warn(`Could not update listing fee status for ${paymentContext.item.id}:`, err);
                }
              }
            } else if (paymentContext.type === 'hostel_rent') {
              await addDoc(collection(db, 'payments'), {
                userId: user.uid,
                hostelId: paymentContext.item.id,
                hostelName: paymentContext.item.name,
                amount: paymentContext.amount,
                status: 'Success',
                razorpayOrderId: mockResponse.razorpay_order_id,
                razorpayPaymentId: mockResponse.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            } else if (paymentContext.type === 'tiffin_subscription') {
              await addDoc(collection(db, 'payments'), {
                userId: user.uid,
                serviceId: paymentContext.item.id,
                serviceName: paymentContext.item.name,
                amount: paymentContext.amount,
                status: 'Success',
                type: 'Tiffin Subscription',
                razorpayOrderId: mockResponse.razorpay_order_id,
                razorpayPaymentId: mockResponse.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            } else if (paymentContext.type === 'market_sale') {
              if (!isMockId(paymentContext.item.id)) {
                try {
                  await updateDoc(doc(db, 'marketItems', paymentContext.item.id), {
                    availability: 'Sold'
                  });
                } catch (err) {
                  console.warn(`Could not update market item status for ${paymentContext.item.id}:`, err);
                }
              }
              await addDoc(collection(db, 'payments'), {
                userId: user.uid,
                itemId: paymentContext.item.id,
                itemTitle: paymentContext.item.title,
                amount: paymentContext.amount,
                status: 'Success',
                type: 'Marketplace Sale',
                razorpayOrderId: mockResponse.razorpay_order_id,
                razorpayPaymentId: mockResponse.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            } else if (paymentContext.type === 'donation') {
              await addDoc(collection(db, 'donations'), {
                userId: user.uid,
                amount: paymentContext.amount,
                status: 'Success',
                razorpayOrderId: mockResponse.razorpay_order_id,
                razorpayPaymentId: mockResponse.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            }

            setTimeout(() => {
              setShowPaymentModal(false);
              setPaymentStatus('idle');
              setPaymentContext(null);
            }, 2000);
          })();
        }, 2000);
        return;
      }

      if (!(window as any).Razorpay) {
        throw new Error('Razorpay SDK not loaded. Please check your internet connection or script tag.');
      }

      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        throw new Error('Razorpay Key (VITE_RAZORPAY_KEY_ID) is missing. Please add it to your environment variables.');
      }

      const options = {
        key: razorpayKey,
        amount: order.amount,
        currency: order.currency,
        name: "Student Solution",
        description: paymentContext.description,
        order_id: order.id,
        handler: async function (response: any) {
          const verifyRes = await fetch(`${API_BASE_URL}/api/payment/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });

          const verifyData = await verifyRes.json();

          if (verifyData.status === 'success') {
            setPaymentStatus('success');
            
            // Handle post-payment logic based on type
            const isMockId = (id: string) => !id || id.startsWith('mock') || /^\d+$/.test(id);
            
            if (paymentContext.type === 'listing_fee') {
              if (!isMockId(paymentContext.item.id)) {
                const collectionName = paymentContext.itemType === 'hostel' ? 'hostels' : 
                                      paymentContext.itemType === 'tiffin' ? 'tiffinServices' : 'jobs';
                try {
                  await updateDoc(doc(db, collectionName, paymentContext.item.id), {
                    listingFeePaid: true
                  });
                } catch (err) {
                  console.warn(`Could not update listing fee status for ${paymentContext.item.id}:`, err);
                }
              }
            } else if (paymentContext.type === 'hostel_rent') {
              await addDoc(collection(db, 'payments'), {
                userId: user.uid,
                hostelId: paymentContext.item.id,
                hostelName: paymentContext.item.name,
                amount: paymentContext.amount,
                status: 'Success',
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            } else if (paymentContext.type === 'tiffin_subscription') {
              await addDoc(collection(db, 'payments'), {
                userId: user.uid,
                serviceId: paymentContext.item.id,
                serviceName: paymentContext.item.name,
                amount: paymentContext.amount,
                status: 'Success',
                type: 'Tiffin Subscription',
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            } else if (paymentContext.type === 'market_sale') {
              if (!isMockId(paymentContext.item.id)) {
                try {
                  await updateDoc(doc(db, 'marketItems', paymentContext.item.id), {
                    availability: 'Sold'
                  });
                } catch (err) {
                  console.warn(`Could not update market item status for ${paymentContext.item.id}:`, err);
                }
              }
              await addDoc(collection(db, 'payments'), {
                userId: user.uid,
                itemId: paymentContext.item.id,
                itemTitle: paymentContext.item.title,
                amount: paymentContext.amount,
                status: 'Success',
                type: 'Marketplace Sale',
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            } else if (paymentContext.type === 'donation') {
              await addDoc(collection(db, 'donations'), {
                userId: user.uid,
                amount: paymentContext.amount,
                status: 'Success',
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                createdAt: new Date().toISOString()
              });
            }

            setTimeout(() => {
              setShowPaymentModal(false);
              setPaymentStatus('idle');
              setPaymentContext(null);
            }, 2000);
          } else {
            alert('Payment verification failed');
            setPaymentStatus('idle');
          }
        },
        prefill: {
          name: user.displayName || "",
          email: user.email || "",
          contact: ""
        },
        theme: {
          color: "#4f46e5"
        },
        modal: {
          ondismiss: function() {
            setPaymentStatus('idle');
            setShowPaymentModal(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
      
    } catch (error: any) {
      console.error('Payment Error:', error);
      alert(`Payment failed to initiate: ${error.message}`);
      setPaymentStatus('idle');
      setShowPaymentModal(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setIsAdmin(u.email === 'rahulpandeylk123@gmail.com');
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-white dark:bg-slate-900 font-sans text-gray-900 dark:text-gray-100 selection:bg-indigo-100">
          <Navbar user={user} onLogout={handleLogout} isAdmin={isAdmin} theme={theme} setTheme={setTheme} />
          <main>
            <Routes>
              <Route path="/" element={<HomeView />} />
              <Route path="/hostels" element={<FindMyStay user={user} initiatePayment={initiatePayment} />} />
              <Route path="/tiffin" element={<TiffinMate user={user} initiatePayment={initiatePayment} paymentStatus={paymentStatus} />} />
              <Route path="/swap" element={<StudentSwap user={user} initiatePayment={initiatePayment} />} />
              <Route path="/jobs" element={<JobFinder user={user} initiatePayment={initiatePayment} />} />
              <Route path="/dashboard" element={<UserDashboard user={user} initiatePayment={initiatePayment} />} />
              <Route path="/admin" element={isAdmin ? <AdminDashboard user={user} /> : <HomeView />} />
              <Route path="/auth" element={<AuthPage />} />
            </Routes>
          </main>
          
          <footer className="bg-gray-50 dark:bg-slate-800 py-16 mt-20 border-t border-gray-100 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center md:items-start text-center md:text-left">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-10 h-10 overflow-hidden rounded-lg flex items-center justify-center">
                    <img src={logoImage} alt="Student Solution Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <span className="font-bold text-xl tracking-tight">Student Solution</span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-4">Empowering students with essential utilities for a better campus life experience.</p>
                <p className="text-gray-400 text-sm">© 2026 Student Solution.</p>
              </div>
              
              <div className="flex flex-col items-center md:items-start">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-widest text-sm">Our Services</h4>
                <div className="space-y-3 flex flex-col items-center md:items-start">
                  <Link to="/hostels" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-colors">Hostels</Link>
                  <Link to="/tiffin" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-colors">Tiffin Services</Link>
                  <Link to="/swap" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-colors">Student Swap (Market)</Link>
                  <Link to="/jobs" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-colors">Job Portal</Link>
                </div>
              </div>

              <div className="flex flex-col items-center md:items-start">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-widest text-sm">Support Us</h4>
                <p className="text-gray-500 dark:text-gray-400 mb-4 text-center md:text-left">Love what we do? Your contributions help us keep the servers running and features growing!</p>
                <button 
                  onClick={() => user ? setShowSupportModal(true) : alert('Please login to support')}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition"
                >
                  ❤️ Support our Company
                </button>
              </div>
            </div>
          </footer>

          {/* Support Modal */}
          <AnimatePresence>
            {showSupportModal && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSupportModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[40px] p-8 relative z-10 shadow-2xl text-center">
                  <div className="w-16 h-16 bg-pink-50 dark:bg-pink-900/30 rounded-3xl flex items-center justify-center text-pink-500 mx-auto mb-6">
                    <Heart size={32} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2">Support Us</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">Enter any amount you'd like to chip in.</p>
                  
                  <div className="relative mb-6">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">₹</span>
                    <input 
                      type="number"
                      value={supportAmount}
                      onChange={e => setSupportAmount(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border-2 border-gray-100 dark:border-slate-800 rounded-3xl py-4 pl-12 pr-6 text-2xl font-black text-indigo-600 outline-none focus:border-indigo-500 focus:bg-white transition-all text-center"
                    />
                  </div>
                  
                  <button 
                    onClick={() => {
                      const finalAmount = parseInt(supportAmount);
                      if (!finalAmount || finalAmount < 1) return alert('Enter a valid amount');
                      setShowSupportModal(false);
                      initiatePayment({
                        type: 'donation',
                        amount: finalAmount,
                        item: { id: 'support_company', name: 'Support Student Solution' },
                        description: 'Contribution to Student Solution Team'
                      });
                    }}
                    className="w-full bg-indigo-600 text-white py-4 rounded-3xl font-bold hover:bg-indigo-700 shadow-xl dark:shadow-none shadow-indigo-200 transition-all mb-3 text-lg"
                  >
                    Pay with Razorpay
                  </button>
                  <button onClick={() => setShowSupportModal(false)} className="w-full text-gray-400 font-bold hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Global Payment Modal */}
          <AnimatePresence>
            {showPaymentModal && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => paymentStatus !== 'processing' && setShowPaymentModal(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-md"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] p-10 relative z-10 shadow-2xl text-center"
                >
                  {paymentStatus === 'idle' && paymentContext && (
                    <>
                      <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto mb-6">
                        <CreditCard size={40} />
                      </div>
                      <h3 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-2">Confirm Payment</h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-8">{paymentContext.description}</p>
                      
                      <div className="bg-gray-50 dark:bg-slate-800 p-6 rounded-3xl border border-gray-100 dark:border-slate-800 mb-8 text-left">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-500 dark:text-gray-400">Amount</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">₹{paymentContext.amount}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-slate-700">
                          <span className="text-gray-900 dark:text-gray-100 font-bold">Total</span>
                          <span className="text-2xl font-black text-indigo-600">₹{paymentContext.amount}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <button 
                          onClick={handlePayment}
                          className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-bold text-xl hover:bg-indigo-700 shadow-xl dark:shadow-none shadow-indigo-200 transition-all"
                        >
                          Pay Now
                        </button>
                        <button 
                          onClick={() => setShowPaymentModal(false)}
                          className="w-full text-gray-400 font-bold hover:text-gray-600 dark:text-gray-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                  {paymentStatus === 'processing' && (
                    <div className="py-12">
                      <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-8"></div>
                      <h3 className="text-2xl font-bold mb-2">Processing Payment</h3>
                      <p className="text-gray-500 dark:text-gray-400">Securely connecting to gateway...</p>
                    </div>
                  )}

                  {paymentStatus === 'success' && (
                    <div className="py-12">
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto mb-8"
                      >
                        <Check size={48} />
                      </motion.div>
                      <h3 className="text-3xl font-bold mb-2">Payment Successful!</h3>
                      <p className="text-gray-500 dark:text-gray-400">Your transaction has been confirmed.</p>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </Router>
    </ErrorBoundary>
  );
}
