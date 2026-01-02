import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { Users, Calendar, CheckCircle, X, Flame, Droplets, ArrowRight, Upload, QrCode, Download, Camera } from 'lucide-react';
import bgImage from './assets/avatar-bg.jpg';
import QRCode from 'qrcode';
import { Scanner } from '@yudiel/react-qr-scanner';
import { supabase } from './lib/supabase';

// Types
interface Event {
  id: string;
  name: string;
  date: string;
  venue: string;
  pricePerPerson: string;
  pricePerTeam: string;
  pricingType: 'person' | 'team';
  description: string;
  maxMembers: number;
  paymentQRSrc?: string; // DataURL of the admin's payment QR
  bankDetails: string;
  whatsappLink: string;
  isOpen: boolean;
}

interface Member {
  id: string;
  name: string;
  regNo: string;
  year: string;
  section: string;
  stream: string;
  email: string; // KLU Email
  attendance: boolean;
}

interface FormData {
  teamName: string;
  eventId: string;
  leadEmail: string;
  leadPhone: string;
}

interface Registration extends FormData {
  id: string; // Team ID
  teamMembers: Member[];
  paymentStatus: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

export default function App() {
  // Navigation & Auth State
  const [view, setView] = useState('home');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  // Data State - Supabase Backend
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  // Fetch Initial Data & Setup Subscriptions
  useEffect(() => {
    fetchEvents();
    fetchRegistrations();

    // Set up real-time subscriptions
    const eventsSubscription = supabase
      .channel('public:events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchEvents();
      })
      .subscribe();

    const registrationsSubscription = supabase
      .channel('public:registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchRegistrations();
      })
      .subscribe();

    const membersSubscription = supabase
      .channel('public:members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        fetchRegistrations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(eventsSubscription);
      supabase.removeChannel(registrationsSubscription);
      supabase.removeChannel(membersSubscription);
    };
  }, []);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
      return;
    }

    if (data) {
      const mappedEvents: Event[] = data.map(item => ({
        id: item.id,
        name: item.name,
        date: item.date,
        venue: item.venue,
        pricePerPerson: item.price_per_person?.toString() || '0',
        pricePerTeam: item.price_per_team?.toString() || '0',
        pricingType: item.pricing_type,
        description: item.description,
        maxMembers: item.max_members,
        paymentQRSrc: item.payment_qr_url,
        bankDetails: item.bank_details,
        whatsappLink: item.whatsapp_link,
        isOpen: item.is_open ?? true
      }));
      setEvents(mappedEvents);
    }
  };

  const fetchRegistrations = async () => {
    const { data, error } = await supabase
      .from('registrations')
      .select('*, members(*)');

    if (error) {
      console.error('Error fetching registrations:', error);
      return;
    }

    if (data) {
      const mappedRegs: Registration[] = data.map(item => ({
        id: item.id,
        teamName: item.team_name,
        eventId: item.event_id,
        leadEmail: item.lead_email,
        leadPhone: item.lead_phone,
        paymentStatus: item.payment_status,
        timestamp: item.timestamp,
        teamMembers: item.members.map((m: any) => ({
          id: m.id,
          name: m.name,
          regNo: m.reg_no,
          year: m.year,
          section: m.section,
          stream: m.stream,
          email: m.email,
          attendance: m.attendance
        }))
      }));
      setRegistrations(mappedRegs);
    }
  };

  // Registration Flow State
  const [regStep, setRegStep] = useState(0); // 0: Details, 1: Payment, 2: Success
  const [formData, setFormData] = useState<FormData>({ teamName: '', eventId: '', leadEmail: '', leadPhone: '' });
  const [teamMembers, setTeamMembers] = useState<Member[]>([{ id: crypto.randomUUID(), name: '', regNo: '', year: '', section: '', stream: '', email: '', attendance: false }]);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [lastRegisteredTeam, setLastRegisteredTeam] = useState<Registration | null>(null);

  // Admin Actions State
  const [newEvent, setNewEvent] = useState<Omit<Event, 'id'>>({
    name: '', date: '', venue: '', pricePerPerson: '', pricePerTeam: '', pricingType: 'person',
    description: '', bankDetails: '', whatsappLink: '', maxMembers: 4, isOpen: true
  });
  const [adminQrFile, setAdminQrFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Helper: Get Current Event
  const currentEvent = events.find(e => e.id === formData.eventId);

  // --- Handlers: Auth ---
  const handleLogin = () => {
    if (adminPassword === 'avatar2005') {
      setIsAdmin(true);
      setView('admin-dashboard');
    } else alert('Incorrect password');
  };

  // --- Handlers: Admin Event Creation ---
  const handleAdminQrUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAdminQrFile(e.target.files[0]);
    }
  };

  const addEvent = async () => {
    if (!newEvent.name || !newEvent.date) {
      alert("Name and Date are required!");
      return;
    }

    try {
      let payment_qr_url = '';
      if (adminQrFile) {
        const fileExt = adminQrFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `payment-qrs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('hms-storage')
          .upload(filePath, adminQrFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('hms-storage')
          .getPublicUrl(filePath);

        payment_qr_url = publicUrl;
      }

      const { error } = await supabase
        .from('events')
        .insert([{
          name: newEvent.name,
          date: newEvent.date,
          venue: newEvent.venue,
          price_per_person: parseFloat(newEvent.pricePerPerson || '0'),
          price_per_team: parseFloat(newEvent.pricePerTeam || '0'),
          pricing_type: newEvent.pricingType,
          description: newEvent.description,
          max_members: newEvent.maxMembers,
          payment_qr_url,
          bank_details: newEvent.bankDetails,
          whatsapp_link: newEvent.whatsappLink,
          is_open: true
        }])
        .select();

      if (error) throw error;

      setNewEvent({ name: '', date: '', venue: '', pricePerPerson: '', pricePerTeam: '', pricingType: 'person', description: '', bankDetails: '', whatsappLink: '', maxMembers: 4, paymentQRSrc: '', isOpen: true });
      setAdminQrFile(null);
      alert('Event created!');
      setView('admin-dashboard');

    } catch (e) {
      console.error("Error adding event: ", e);
      alert("Error saving event");
    }
  };

  // --- Handlers: Registration Flow ---
  const resetRegForm = () => {
    setFormData({ teamName: '', eventId: '', leadEmail: '', leadPhone: '' });
    setTeamMembers([{ id: crypto.randomUUID(), name: '', regNo: '', year: '', section: '', stream: '', email: '', attendance: false }]);
    setPaymentProof(null);
    setRegStep(0);
    setScanResult(null);
  };

  const handleMemberChange = (index: number, field: keyof Member, value: string) => {
    const updated = [...teamMembers];
    // @ts-ignore
    updated[index][field] = value;
    setTeamMembers(updated);
  };

  const addMember = () => {
    if (!currentEvent) return;
    if (teamMembers.length < currentEvent.maxMembers) {
      setTeamMembers([...teamMembers, { id: crypto.randomUUID(), name: '', regNo: '', year: '', section: '', stream: '', email: '', attendance: false }]);
    } else {
      alert(`Maximum team size is ${currentEvent.maxMembers}`);
    }
  };

  const removeMember = (index: number) => {
    if (teamMembers.length > 1) {
      setTeamMembers(teamMembers.filter((_, i) => i !== index));
    }
  };

  const calcPrice = () => {
    if (!currentEvent) return 0;
    const pPerson = parseInt(currentEvent.pricePerPerson || '0');
    const pTeam = parseInt(currentEvent.pricePerTeam || '0');
    return currentEvent.pricingType === 'person' ? pPerson * teamMembers.length : pTeam;
  };

  const nextStep = (e: FormEvent) => {
    e.preventDefault();
    if (regStep === 0) {
      if (!formData.eventId) { alert("Select an event"); return; }
      if (!formData.teamName) { alert("Enter team name"); return; }
      setRegStep(1);
    } else if (regStep === 1) {
      if (!paymentProof) { alert("Please upload payment proof"); return; }

      const submitRegistration = async () => {
        try {
          let payment_proof_url = '';
          if (paymentProof) {
            const fileExt = paymentProof.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `payment-proofs/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('hms-storage')
              .upload(filePath, paymentProof);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('hms-storage')
              .getPublicUrl(filePath);

            payment_proof_url = publicUrl;
          }

          // 1. Insert Registration
          const { data: regData, error: regError } = await supabase
            .from('registrations')
            .insert([{
              event_id: formData.eventId,
              team_name: formData.teamName,
              lead_email: formData.leadEmail,
              lead_phone: formData.leadPhone,
              payment_status: 'pending',
              payment_proof_url
            }])
            .select()
            .single();

          if (regError) throw regError;

          // 2. Insert Members
          const membersToInsert = teamMembers.map(m => ({
            registration_id: regData.id,
            name: m.name,
            reg_no: m.regNo,
            year: m.year,
            section: m.section,
            stream: m.stream,
            email: m.email,
            attendance: false
          }));

          const { error: memError } = await supabase
            .from('members')
            .insert(membersToInsert);

          if (memError) throw memError;

          const newReg: Registration = {
            ...formData,
            id: regData.id,
            teamMembers,
            paymentStatus: 'pending',
            timestamp: regData.timestamp
          };

          setLastRegisteredTeam(newReg);
          setRegStep(2);
        } catch (e) {
          console.error("Error registering:", e);
          alert("Registration failed. Please try again.");
        }
      };
      submitRegistration();
    }
  };

  // --- Handlers: Success & Downloads ---
  const downloadTicket = async (member: Member, team: Registration) => {
    // Generate QR Data: EVENTID | TEAMID | MEMBERID
    const qrData = JSON.stringify({ e: team.eventId, t: team.id, m: member.id });
    const url = await QRCode.toDataURL(qrData);

    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `${team.teamName}-${member.name}-TICKET.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTeamCSV = (team: Registration) => {
    const headers = ['Team Name', 'Lead Email', 'Lead Phone', 'Member Name', 'Reg No', 'Email', 'Year', 'Section', 'Stream'];
    const rows = team.teamMembers.map(m => [
      team.teamName, team.leadEmail, team.leadPhone,
      m.name, m.regNo, m.email, m.year, m.section, m.stream
    ]);

    const csvContent = "data:text/csv;charset=utf-8," +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `${team.teamName}_data.csv`;
    link.click();
  };

  const toggleEventStatus = async (eventId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ is_open: !currentStatus })
        .eq('id', eventId);

      if (error) throw error;
      // Real-time subscription will update the state
    } catch (e) {
      console.error("Error toggling event status:", e);
      alert("Failed to update status");
    }
  };

  // --- Handlers: Admin Attendance ---
  const handleScan = async (result: any) => {
    if (result && result.length > 0) {
      const rawValue = result[0].rawValue;
      if (!rawValue) return;

      try {
        const { e: eid, t: tid, m: mid } = JSON.parse(rawValue);

        // Find registration in local state first for quick feedback
        const reg = registrations.find(r => r.id === tid && r.eventId === eid);
        if (!reg) { setScanResult("❌ Registration not found"); return; }

        const member = reg.teamMembers.find(m => m.id === mid.toString());
        if (!member) { setScanResult("❌ Member not found"); return; }

        if (member.attendance) {
          setScanResult(`⚠️ ${member.name} already marked present!`);
          return;
        }

        // Update Supabase
        const { error } = await supabase
          .from('members')
          .update({ attendance: true })
          .eq('id', mid);

        if (error) throw error;

        setScanResult(`✅ Marked PRESENT: ${member.name}`);

      } catch (err) {
        console.error(err);
        setScanResult("❌ Error parsing/updating QR");
      }
    }
  };

  const downloadPresentCSV = () => {
    const headers = ['Event', 'Team', 'Member Name', 'Reg No', 'Email', 'Status'];
    const rows: string[][] = [];

    registrations.forEach(r => {
      const evtName = events.find(e => e.id === r.eventId)?.name || 'Unknown';
      r.teamMembers.forEach(m => {
        if (m.attendance) {
          rows.push([evtName, r.teamName, m.name, m.regNo, m.email, 'PRESENT']);
        }
      });
    });

    if (rows.length === 0) { alert("No members marked present yet."); return; }

    const csvContent = "data:text/csv;charset=utf-8," +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `attendance_report_${Date.now()}.csv`;
    link.click();
  };

  // --- Handlers: Admin Stats & Export ---
  const getEventStats = (eventId: string) => {
    const eventRegs = registrations.filter(r => r.eventId === eventId);
    const event = events.find(e => e.id === eventId);
    if (!event) return { teams: 0, members: 0, revenue: 0 };

    const teams = eventRegs.length;
    const members = eventRegs.reduce((acc, r) => acc + r.teamMembers.length, 0);

    // Revenue Calculation
    const pPerson = parseInt(event.pricePerPerson || '0');
    const pTeam = parseInt(event.pricePerTeam || '0');
    const revenue = event.pricingType === 'person' ? members * pPerson : teams * pTeam;

    return { teams, members, revenue };
  };

  const downloadEventData = (event: Event) => {
    const eventRegs = registrations.filter(r => r.eventId === event.id);
    if (eventRegs.length === 0) { alert("No registrations for this event."); return; }

    const headers = ['Team ID', 'Team Name', 'Lead Email', 'Lead Phone', 'Member Name', 'Reg No', 'Email', 'Year', 'Section', 'Stream', 'Attendance', 'Payment Status', 'Timestamp'];
    const rows: string[][] = [];

    eventRegs.forEach(r => {
      r.teamMembers.forEach(m => {
        rows.push([
          r.id, r.teamName, r.leadEmail, r.leadPhone,
          m.name, m.regNo, m.email, m.year, m.section, m.stream,
          m.attendance ? 'PRESENT' : 'ABSENT',
          r.paymentStatus,
          r.timestamp
        ]);
      });
    });

    const csvContent = "data:text/csv;charset=utf-8," +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `${event.name}_FULL_DATA.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen relative overflow-y-auto text-amber-50">
      {/* Background Image with Overlay */}
      <div className="fixed inset-0 z-0">
        <img src={bgImage} alt="Avatar Background" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      </div>

      <nav className="relative z-10 border-b border-amber-500/30 bg-black/40 backdrop-blur-md sticky top-0">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-2xl animate-pulse">⬇</span>
            </div>
            <h1 className="text-3xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 drop-shadow-sm">HMS</h1>
          </div>
          <div className="flex space-x-4">
            {!isAdmin ? (
              <>
                <button onClick={() => setView('home')} className={`px-4 py-2 hover:text-amber-300 ${view === 'home' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>Home</button>
                <button onClick={() => setView('events')} className={`px-4 py-2 hover:text-amber-300 ${view === 'events' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>Events</button>
                <button onClick={() => { setView('register'); resetRegForm(); }} className={`px-4 py-2 hover:text-amber-300 ${view === 'register' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>Register</button>
                <button onClick={() => setView('login')} className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all border border-white/20">Admin</button>
              </>
            ) : (
              <>
                <button onClick={() => setView('admin-dashboard')} className="px-4 py-2 text-white hover:text-amber-300">Dashboard</button>
                <button onClick={() => setView('admin-create')} className="px-4 py-2 text-white hover:text-amber-300">Create Event</button>
                <button onClick={() => setView('admin-attendance')} className="px-4 py-2 text-white hover:text-amber-300">Attendance</button>
                <button onClick={() => { setIsAdmin(false); setView('home'); }} className="px-4 py-2 bg-red-600/80 text-white rounded-lg hover:bg-red-700">Logout</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="relative z-10 container mx-auto px-6 py-12">

        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="text-center py-20">
            <div className="backdrop-blur-md bg-black/40 rounded-3xl p-16 border border-amber-500/20 shadow-2xl shadow-black max-w-5xl mx-auto transform hover:scale-[1.01] transition-transform duration-500">
              <h2 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600 mb-8 font-avatar drop-shadow-lg">Master the Elements of Code</h2>
              <p className="text-3xl text-amber-100/80 mb-12 tracking-wide">Join the ultimate bending-themed hackathon experience.</p>
              <div className="flex justify-center space-x-8">
                <button onClick={() => setView('events')} className="group relative px-8 py-4 bg-gradient-to-r from-amber-600 to-red-700 text-white rounded-xl text-xl font-bold shadow-lg shadow-orange-900/40 hover:from-amber-500 hover:to-red-600 transition-all">
                  <span className="relative z-10 flex items-center gap-2">View Events <Flame size={20} className="group-hover:animate-bounce" /></span>
                </button>
                <button onClick={() => { setView('register'); resetRegForm(); }} className="group px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-xl text-xl font-bold shadow-lg shadow-blue-900/40 hover:from-cyan-500 hover:to-blue-600 transition-all">
                  <span className="flex items-center gap-2">Register Now <Droplets size={20} className="group-hover:animate-bounce" /></span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: EVENTS */}
        {view === 'events' && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-5xl font-bold text-amber-100 mb-10 border-b border-amber-500/30 pb-4 inline-block">Upcoming Events</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {events.map(e => (
                <div key={e.id} className="group backdrop-blur-md bg-black/40 rounded-2xl p-8 border border-white/10 hover:border-amber-500/50 transition-all shadow-xl">
                  <h3 className="text-3xl font-bold text-amber-400 mb-4">{e.name}</h3>
                  <div className="space-y-2 text-white/80">
                    <p className="flex items-center gap-2"><Calendar size={18} /> {new Date(e.date).toLocaleDateString()}</p>
                    <p className="flex items-center gap-2"><Users size={18} /> {e.venue}</p>
                    <p className="flex items-center gap-2"><Users size={18} /> Max Team Size: {e.maxMembers}</p>
                  </div>
                  <p className="text-cyan-300 font-bold text-2xl mt-4 border-t border-white/10 pt-4">{e.pricingType === 'person' ? `₹${e.pricePerPerson} / bender` : `₹${e.pricePerTeam} / team`}</p>
                  {e.isOpen ? (
                    <button onClick={() => { resetRegForm(); setFormData(p => ({ ...p, eventId: e.id })); setView('register'); }} className="mt-6 w-full px-4 py-3 bg-gradient-to-r from-amber-600 to-red-600 text-white rounded-lg font-bold shadow-lg hover:shadow-orange-500/20 transition-all">Register Team</button>
                  ) : (
                    <button disabled className="mt-6 w-full px-4 py-3 bg-gray-600 text-gray-300 rounded-lg font-bold cursor-not-allowed">Registrations Closed</button>
                  )}
                </div>
              ))}
              {events.length === 0 && <p className="text-white/50 text-2xl">No events found.</p>}
            </div>
          </div>
        )}

        {/* VIEW: REGISTRATION FLOW */}
        {view === 'register' && (
          <div className="max-w-4xl mx-auto">
            <div className="backdrop-blur-xl bg-black/50 rounded-2xl p-10 border border-amber-500/20 shadow-2xl">

              {/* Steps Indicator */}
              <div className="flex justify-between mb-8 border-b border-white/10 pb-4">
                {[0, 1, 2].map(step => (
                  <div key={step} className={`flex items-center gap-2 ${regStep >= step ? 'text-amber-400' : 'text-white/30'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${regStep >= step ? 'border-amber-400 bg-amber-500/20' : 'border-white/30'}`}>{step + 1}</div>
                    <span className="font-bold hidden md:block">{step === 0 ? 'Details' : step === 1 ? 'Payment' : 'Done'}</span>
                  </div>
                ))}
              </div>

              {regStep === 0 && (
                <form onSubmit={nextStep} className="space-y-6">
                  <h3 className="text-2xl font-bold text-white mb-4">Team Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <select value={formData.eventId} onChange={e => setFormData({ ...formData, eventId: e.target.value })} className="input-field" required>
                      <option value="" className="bg-gray-900">Select Event</option>
                      {events.map(e => <option key={e.id} value={e.id} className="bg-gray-900">{e.name} (Max {e.maxMembers})</option>)}
                    </select>
                    <input type="text" value={formData.teamName} onChange={e => setFormData({ ...formData, teamName: e.target.value })} placeholder="Team Name" className="input-field" required />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input type="email" value={formData.leadEmail} onChange={e => setFormData({ ...formData, leadEmail: e.target.value })} placeholder="Lead Email" className="input-field" required />
                    <input type="tel" value={formData.leadPhone} onChange={e => setFormData({ ...formData, leadPhone: e.target.value })} placeholder="Lead Phone" className="input-field" required />
                  </div>

                  <div className="border-t border-white/10 pt-6 mt-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-amber-200">Members ({teamMembers.length}/{currentEvent?.maxMembers || '?'})</h3>
                      <button type="button" onClick={addMember} className="px-3 py-1 bg-green-600/50 hover:bg-green-600 text-white rounded flex items-center gap-1"><Users size={16} /> Add</button>
                    </div>

                    {teamMembers.map((m, i) => (
                      <div key={m.id} className="bg-white/5 rounded-lg p-4 mb-4 border border-white/5">
                        <div className="flex justify-between mb-2">
                          <span className="text-white/60 text-sm">Member {i + 1}</span>
                          {i > 0 && <button type="button" onClick={() => removeMember(i)}><X size={16} className="text-red-400" /></button>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input type="text" placeholder="Name" value={m.name} onChange={e => handleMemberChange(i, 'name', e.target.value)} className="input-sm" required />
                          <input type="text" placeholder="Reg No" value={m.regNo} onChange={e => handleMemberChange(i, 'regNo', e.target.value)} className="input-sm" required />
                          <input type="email" placeholder="KLU Email" value={m.email} onChange={e => handleMemberChange(i, 'email', e.target.value)} className="input-sm" required />
                          <input type="text" placeholder="Year" value={m.year} onChange={e => handleMemberChange(i, 'year', e.target.value)} className="input-sm" required />
                          <input type="text" placeholder="Section" value={m.section} onChange={e => handleMemberChange(i, 'section', e.target.value)} className="input-sm" required />
                          <input type="text" placeholder="Stream" value={m.stream} onChange={e => handleMemberChange(i, 'stream', e.target.value)} className="input-sm" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="submit" className="w-full btn-primary mt-4">Proceed to Payment <ArrowRight size={20} /></button>
                </form>
              )}

              {regStep === 1 && currentEvent && (
                <form onSubmit={nextStep} className="space-y-8">
                  <div className="bg-amber-500/10 rounded-xl p-6 border border-amber-500/20">
                    <h3 className="text-xl font-bold text-amber-400 mb-2">Payment Summary</h3>
                    <p className="text-white/80">Event: {currentEvent.name}</p>
                    <p className="text-white/80">Members: {teamMembers.length}</p>
                    <p className="text-3xl font-bold text-white mt-4">Total: ₹{calcPrice()}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="text-center">
                      <h4 className="text-white font-bold mb-4">Scan QR to Pay</h4>
                      <div className="bg-white p-4 rounded-xl inline-block">
                        {currentEvent.paymentQRSrc ? (
                          <img src={currentEvent.paymentQRSrc} alt="Pay QR" className="w-48 h-48 object-contain" />
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center text-gray-400 italic bg-gray-100">No QR Code Set</div>
                        )}
                      </div>
                      {currentEvent.bankDetails && <p className="text-white/60 text-sm mt-4 whitespace-pre-wrap">{currentEvent.bankDetails}</p>}
                    </div>

                    <div>
                      <h4 className="text-white font-bold mb-4">Upload Proof</h4>
                      <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-amber-500/50 transition-colors">
                        <input type="file" id="proof" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files && setPaymentProof(e.target.files[0])} />
                        <label htmlFor="proof" className="cursor-pointer block">
                          <Upload size={40} className="mx-auto text-amber-500 mb-2" />
                          <p className="text-white/80">{paymentProof ? paymentProof.name : "Click to select file"}</p>
                        </label>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full btn-success mt-4">Confirm & Submit <CheckCircle size={20} /></button>
                </form>
              )}

              {regStep === 2 && lastRegisteredTeam && (
                <div className="text-center">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={40} className="text-green-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">Registration Complete!</h2>
                  <p className="text-white/60 mb-8">Registered for {events.find(e => e.id === lastRegisteredTeam.eventId)?.name}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
                    <button onClick={() => downloadTeamCSV(lastRegisteredTeam)} className="p-4 bg-blue-600/30 border border-blue-500/50 rounded-xl hover:bg-blue-600/50 flex flex-col items-center gap-2 transition-all">
                      <Download size={24} className="text-blue-300" />
                      <span className="font-bold text-white">Download Team Data (CSV)</span>
                    </button>

                    {currentEvent?.whatsappLink && (
                      <a href={currentEvent.whatsappLink} target="_blank" className="p-4 bg-green-600/30 border border-green-500/50 rounded-xl hover:bg-green-600/50 flex flex-col items-center gap-2 transition-all">
                        <span className="text-2xl">📱</span>
                        <span className="font-bold text-white">Join WhatsApp Group</span>
                      </a>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-amber-200 mb-4 border-t border-white/10 pt-6">Individual Tickets</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {lastRegisteredTeam.teamMembers.map(m => (
                      <div key={m.id} className="bg-white/10 p-4 rounded-lg flex justify-between items-center">
                        <div className="text-left">
                          <p className="font-bold text-white">{m.name}</p>
                          <p className="text-xs text-white/50">{m.regNo}</p>
                        </div>
                        <button onClick={() => downloadTicket(m, lastRegisteredTeam)} className="p-2 bg-white text-black rounded hover:bg-gray-200 flex items-center gap-2 text-sm font-bold">
                          <QrCode size={16} /> Ticket
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => { setView('home'); resetRegForm(); }} className="mt-10 text-white/50 hover:text-white underline">Back to Home</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: ADMIN DASHBOARD */}
        {view === 'admin-dashboard' && isAdmin && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-8">Admin Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="admin-card cursor-pointer" onClick={() => setView('admin-create')}>
                <Calendar size={40} className="text-purple-400 mb-4 mx-auto" />
                <h3 className="text-2xl font-bold text-white">Create Event</h3>
              </div>
              <div className="admin-card cursor-pointer" onClick={() => setView('admin-events')}>
                <Users size={40} className="text-blue-400 mb-4 mx-auto" />
                <h3 className="text-2xl font-bold text-white">Ongoing Events</h3>
              </div>
              <div className="admin-card cursor-pointer" onClick={() => setView('admin-attendance')}>
                <Camera size={40} className="text-green-400 mb-4 mx-auto" />
                <h3 className="text-2xl font-bold text-white">Attendance</h3>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: ADMIN ONGOING EVENTS (STATS) */}
        {view === 'admin-events' && isAdmin && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold text-white mb-10 text-center">Event Statistics</h2>
            <div className="grid grid-cols-1 gap-6">
              {events.map(e => {
                const stats = getEventStats(e.id);
                return (
                  <div key={e.id} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-left flex-1">
                      <h3 className="text-2xl font-bold text-amber-400 mb-1">{e.name}</h3>
                      <p className="text-white/60 text-sm flex gap-4">
                        <span>📅 {new Date(e.date).toLocaleDateString()}</span>
                        <span>📍 {e.venue}</span>
                      </p>
                    </div>
                    <div className="flex gap-8 text-center">
                      <div>
                        <p className="text-3xl font-bold text-white">{stats.teams}</p>
                        <p className="text-xs text-white/50 uppercase tracking-wider">Teams</p>
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-white">{stats.members}</p>
                        <p className="text-xs text-white/50 uppercase tracking-wider">Members</p>
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-green-400">₹{stats.revenue}</p>
                        <p className="text-xs text-white/50 uppercase tracking-wider">Est. Revenue</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => downloadEventData(e)} className="px-6 py-2 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl hover:bg-blue-600/40 transition-all font-bold flex items-center gap-2">
                        <Download size={18} /> Export Data
                      </button>
                      <button
                        onClick={() => toggleEventStatus(e.id, e.isOpen)}
                        className={`px-6 py-2 rounded-xl font-bold transition-all border ${e.isOpen ? 'bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/40' : 'bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/40'}`}
                      >
                        {e.isOpen ? 'Close Registrations' : 'Open Registrations'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && <p className="text-center text-white/50 text-xl py-10">No events created yet.</p>}
            </div>
          </div>
        )}

        {/* VIEW: ADMIN CREATE EVENT */}
        {view === 'admin-create' && isAdmin && (
          <div className="max-w-2xl mx-auto backdrop-blur-xl bg-black/50 rounded-2xl p-10 border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-6">Create New Event</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Event Name" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} className="input-field" />
              <div className="grid grid-cols-2 gap-4">
                <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className="input-field" />
                <input type="text" placeholder="Venue" value={newEvent.venue} onChange={e => setNewEvent({ ...newEvent, venue: e.target.value })} className="input-field" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Max Team Size</label>
                  <input type="number" value={newEvent.maxMembers} onChange={e => setNewEvent({ ...newEvent, maxMembers: parseInt(e.target.value) })} className="input-field" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Pricing Helper</label>
                  <select value={newEvent.pricingType} onChange={e => setNewEvent({ ...newEvent, pricingType: e.target.value as any })} className="input-field">
                    <option value="person" className="bg-gray-900">Per Person</option>
                    <option value="team" className="bg-gray-900">Per Team</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {newEvent.pricingType === 'person' ? (
                  <input type="number" placeholder="Price Per Person" value={newEvent.pricePerPerson} onChange={e => setNewEvent({ ...newEvent, pricePerPerson: e.target.value })} className="input-field" />
                ) : (
                  <input type="number" placeholder="Price Per Team" value={newEvent.pricePerTeam} onChange={e => setNewEvent({ ...newEvent, pricePerTeam: e.target.value })} className="input-field" />
                )}
                <input type="text" placeholder="WhatsApp Link" value={newEvent.whatsappLink} onChange={e => setNewEvent({ ...newEvent, whatsappLink: e.target.value })} className="input-field" />
              </div>

              <textarea placeholder="Description" value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className="input-field" rows={3} />
              <textarea placeholder="Bank Details (Optional)" value={newEvent.bankDetails} onChange={e => setNewEvent({ ...newEvent, bankDetails: e.target.value })} className="input-field" rows={2} />

              <div className="border border-white/20 p-4 rounded-lg">
                <label className="block text-white mb-2">Upload Payment QR Image</label>
                <input type="file" accept="image/*" onChange={handleAdminQrUpload} className="text-white/70" />
              </div>

              <button onClick={addEvent} className="btn-primary w-full mt-4">Create Event</button>
            </div>
          </div>
        )}

        {/* VIEW: ADMIN ATTENDANCE */}
        {view === 'admin-attendance' && isAdmin && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Attendance Scanner</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-black/40 p-6 rounded-2xl border border-white/10 flex flex-col items-center">
                <div className="w-full aspect-square bg-black rounded-lg overflow-hidden relative">
                  <Scanner
                    onScan={(result) => handleScan(result)}
                    styles={{ container: { width: '100%', height: '100%' } }}
                  />
                  <div className="absolute inset-0 border-2 border-amber-500/50 pointer-events-none"></div>
                </div>
                <p className="text-white/50 text-sm mt-4 text-center">Point camera at User Ticket QR</p>
              </div>

              <div className="space-y-6">
                <div className={`p-6 rounded-xl border ${scanResult?.includes('✅') ? 'bg-green-500/20 border-green-500' : scanResult?.includes('⚠️') ? 'bg-yellow-500/20 border-yellow-500' : 'bg-white/10 border-white/20'}`}>
                  <h3 className="text-xl font-bold text-white mb-2">Scan Status</h3>
                  <p className="text-2xl">{scanResult || "Waiting for scan..."}</p>
                </div>

                <div className="bg-black/30 p-6 rounded-xl border border-white/10">
                  <h3 className="text-white font-bold mb-4">Actions</h3>
                  <button onClick={downloadPresentCSV} className="w-full p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                    <Download size={20} /> Download Present CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: LOGIN */}
        {view === 'login' && !isAdmin && (
          <div className="max-w-md mx-auto mt-20">
            <div className="backdrop-blur-xl bg-black/60 rounded-2xl p-10 border border-white/10 shadow-2xl">
              <h2 className="text-3xl font-bold text-white mb-8 text-center tracking-widest">ADMIN PORTAL</h2>
              <input type="password" value={adminPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setAdminPassword(e.target.value)} placeholder="Access Code" className="w-full px-4 py-4 rounded-xl bg-black/40 text-white border border-white/20 focus:border-amber-500 outline-none mb-6 text-center text-lg tracking-widest" />
              <button onClick={handleLogin} className="w-full px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-800 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-purple-900/40 transition-all">Unlock System</button>
            </div>
          </div>
        )}


      </div>


    </div>
  );
}