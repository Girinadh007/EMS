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
  year: string; // Will be 1st, 2nd, 3rd, 4th
  dept: string; // CSE, ECE, IT, EEE, Mech, others
  otherDept?: string; // For "others" choice
  email: string; // KLU Email
  attendance: boolean;
}

interface FormData {
  teamName: string;
  eventId: string;
  leadEmail: string;
  leadMobile: string; // New field
  transactionId?: string;
}

interface Registration extends FormData {
  id: string; // Team ID
  teamMembers: Member[];
  paymentStatus: 'pending' | 'approved' | 'rejected';
  timestamp: string;
  paymentProofUrl?: string;
}

export default function App() {
  // Navigation & Auth State
  const [view, setView] = useState('home');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  // Data State - Supabase Backend
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  // Fetch Initial Data & Setup Subscriptions (Realtime via Supabase)
  useEffect(() => {
    // Initial fetch for events
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: true });
      if (data) {
        const mapped = data.map(e => ({
          id: e.id,
          name: e.name,
          date: e.date,
          venue: e.venue,
          pricePerPerson: e.price_per_person,
          pricePerTeam: e.price_per_team,
          pricingType: e.pricing_type,
          description: e.description,
          maxMembers: e.max_members,
          paymentQRSrc: e.payment_qr_src,
          bankDetails: e.bank_details,
          whatsappLink: e.whatsapp_link,
          isOpen: e.is_open
        }));
        setEvents(mapped as Event[]);
      }
      if (error) console.error('Error fetching events:', error);
    };

    // Initial fetch for registrations
    const fetchRegistrations = async () => {
      const { data, error } = await supabase
        .from('registrations')
        .select('*');
      if (data) {
        const mapped = data.map(r => ({
          id: r.id,
          eventId: r.event_id,
          teamName: r.team_name,
          leadEmail: r.lead_email,
          leadMobile: r.lead_mobile, // New
          paymentStatus: r.payment_status,
          paymentProofUrl: r.payment_proof_url,
          transactionId: r.transaction_id,
          timestamp: r.timestamp,
          teamMembers: r.team_members
        }));
        setRegistrations(mapped as Registration[]);
      }
      if (error) console.error('Error fetching registrations:', error);
    };

    fetchEvents();
    fetchRegistrations();

    // Subscribe to changes
    const eventsChannel = supabase
      .channel('events-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
        const mapEvent = (e: any) => ({
          id: e.id,
          name: e.name,
          date: e.date,
          venue: e.venue,
          pricePerPerson: e.price_per_person,
          pricePerTeam: e.price_per_team,
          pricingType: e.pricing_type,
          description: e.description,
          maxMembers: e.max_members,
          paymentQRSrc: e.payment_qr_src,
          bankDetails: e.bank_details,
          whatsappLink: e.whatsapp_link,
          isOpen: e.is_open
        });

        if (payload.eventType === 'INSERT') {
          setEvents(prev => [...prev, mapEvent(payload.new) as Event].sort((a, b) => a.date.localeCompare(b.date)));
        } else if (payload.eventType === 'UPDATE') {
          setEvents(prev => prev.map(e => e.id === payload.new.id ? mapEvent(payload.new) as Event : e));
        } else if (payload.eventType === 'DELETE') {
          setEvents(prev => prev.filter(e => e.id === payload.old.id));
        }
      })
      .subscribe();

    const regsChannel = supabase
      .channel('regs-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, payload => {
        const mapReg = (r: any) => ({
          id: r.id,
          eventId: r.event_id,
          teamName: r.team_name,
          leadEmail: r.lead_email,
          leadMobile: r.lead_mobile, // New
          paymentStatus: r.payment_status,
          paymentProofUrl: r.payment_proof_url,
          transactionId: r.transaction_id,
          timestamp: r.timestamp,
          teamMembers: r.team_members
        });

        if (payload.eventType === 'INSERT') {
          setRegistrations(prev => [...prev, mapReg(payload.new) as Registration]);
          if (view === 'my-tickets') handleTicketSearch(new Event('submit') as any);
        } else if (payload.eventType === 'UPDATE') {
          setRegistrations(prev => prev.map(r => r.id === payload.new.id ? mapReg(payload.new) as Registration : r));
        } else if (payload.eventType === 'DELETE') {
          setRegistrations(prev => prev.filter(r => r.id === payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(regsChannel);
    };
  }, []);


  // Registration Flow State
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [regStep, setRegStep] = useState(0); // 0: Details, 1: Payment, 2: Success

  // Load persisted form data
  const persistedFormData = localStorage.getItem('hms_form_data');
  const persistedMembers = localStorage.getItem('hms_members');

  const [formData, setFormData] = useState<FormData>(persistedFormData ? JSON.parse(persistedFormData) : { teamName: '', eventId: '', leadEmail: '', leadMobile: '', transactionId: '' });
  const [teamMembers, setTeamMembers] = useState<Member[]>(persistedMembers ? JSON.parse(persistedMembers) : [{ id: crypto.randomUUID(), name: '', regNo: '', year: '1st', dept: 'CSE', email: '', attendance: false }]);

  // Persist form data to localStorage
  useEffect(() => {
    localStorage.setItem('hms_form_data', JSON.stringify(formData));
    localStorage.setItem('hms_members', JSON.stringify(teamMembers));
  }, [formData, teamMembers]);

  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [lastRegisteredTeam, setLastRegisteredTeam] = useState<Registration | null>(null);

  // Admin Actions State
  const [newEvent, setNewEvent] = useState<Omit<Event, 'id'>>({
    name: '', date: '', venue: '', pricePerPerson: '', pricePerTeam: '', pricingType: 'person',
    description: '', bankDetails: '', whatsappLink: '', maxMembers: 4, isOpen: true
  });
  const [isPaymentEnabled, setIsPaymentEnabled] = useState(true);
  const [paymentChoice, setPaymentChoice] = useState<'qr' | 'bank'>('qr');
  const [adminQrFile, setAdminQrFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedEventIdForRegs, setSelectedEventIdForRegs] = useState<string | null>(null);
  const [ticketSearchEmail, setTicketSearchEmail] = useState('');
  const [foundRegistrations, setFoundRegistrations] = useState<Registration[]>([]);

  // Helper: Get Current Event
  const currentEvent = events.find(e => e.id === formData.eventId);

  // Helper: Image Compression
  const compressImage = (file: File, maxWidth = 800): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas toBlob failed'));
            },
            'image/jpeg',
            0.7 // Compression quality
          );
        };
      };
      reader.onerror = (e) => reject(e);
    });
  };

  // Helper: ImgBB Upload
  const uploadToImgBB = async (file: File | Blob, fileName?: string): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file, fileName || 'upload.jpg');
    const API_KEY = 'e29078b17708a3e1d858216057fc9338';

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (data.success) {
      return data.data.url;
    } else {
      throw new Error('Upload Failed: ' + (data.error?.message || 'Unknown error'));
    }
  };


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

  const saveEvent = async () => {
    if (!newEvent.name || !newEvent.date) {
      alert("Name and Date are required!");
      return;
    }

    setIsSubmitting(true);

    try {
      let paymentQRSrc = '';
      if (adminQrFile) {
        console.log("Compressing QR...");
        const compressed = await compressImage(adminQrFile, 400); // QR doesn't need to be big
        paymentQRSrc = await uploadToImgBB(compressed, 'qr.jpg');
      } else if (editingEventId) {
        const existing = events.find(e => e.id === editingEventId);
        paymentQRSrc = existing?.paymentQRSrc || '';
      }

      const eventData = {
        name: newEvent.name,
        date: newEvent.date,
        venue: newEvent.venue,
        price_per_person: isPaymentEnabled ? (newEvent.pricePerPerson || '0') : '0',
        price_per_team: isPaymentEnabled ? (newEvent.pricePerTeam || '0') : '0',
        pricing_type: newEvent.pricingType,
        description: newEvent.description,
        max_members: newEvent.maxMembers,
        payment_qr_src: paymentChoice === 'qr' ? paymentQRSrc : '',
        bank_details: paymentChoice === 'bank' ? newEvent.bankDetails : '',
        whatsapp_link: newEvent.whatsappLink,
        is_open: newEvent.isOpen ?? true
      };

      if (editingEventId) {
        const { error } = await supabase.from('events').update(eventData).eq('id', editingEventId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').insert([eventData]);
        if (error) throw error;
      }

      // Optimistic transition
      setView('admin-dashboard');
      alert(editingEventId ? 'Event updated!' : 'Event created!');

      setNewEvent({ name: '', date: '', venue: '', pricePerPerson: '', pricePerTeam: '', pricingType: 'person', description: '', bankDetails: '', whatsappLink: '', maxMembers: 4, isOpen: true });
      setIsPaymentEnabled(true);
      setAdminQrFile(null);
      setEditingEventId(null);

    } catch (e: any) {
      console.error("Error saving event: ", e);
      alert("Error saving event: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditEvent = (event: Event) => {
    setEditingEventId(event.id);
    setNewEvent({
      name: event.name,
      date: event.date,
      venue: event.venue,
      pricePerPerson: event.pricePerPerson,
      pricePerTeam: event.pricePerTeam,
      pricingType: event.pricingType,
      description: event.description,
      maxMembers: event.maxMembers,
      bankDetails: event.bankDetails,
      whatsappLink: event.whatsappLink,
      isOpen: event.isOpen
    });
    setIsPaymentEnabled(event.pricePerPerson !== '0' || event.pricePerTeam !== '0');
    setPaymentChoice(event.paymentQRSrc ? 'qr' : 'bank');
    setAdminQrFile(null);
    setView('admin-create'); // Reuse the create view for editing
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
      alert("Event deleted!");
    } catch (e) {
      console.error("Error deleting event:", e);
      alert("Error deleting event");
    }
  };

  const toggleEventStatus = async (eventId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from('events').update({ is_open: !currentStatus }).eq('id', eventId);
      if (error) throw error;
    } catch (e) {
      console.error("Error toggling:", e);
      alert("Failed to update status");
    }
  };



  // --- Handlers: Registration Flow ---
  const resetRegForm = () => {
    // fetchEvents(); // Realtime handles this
    const freshData = { teamName: '', eventId: '', leadEmail: '', leadMobile: '', transactionId: '' };
    const freshMembers = [{ id: crypto.randomUUID(), name: '', regNo: '', year: '1st', dept: 'CSE', email: '', attendance: false }];

    setFormData(freshData);
    setTeamMembers(freshMembers);
    localStorage.removeItem('hms_form_data');
    localStorage.removeItem('hms_members');

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
      setTeamMembers([...teamMembers, { id: crypto.randomUUID(), name: '', regNo: '', year: '1st', dept: 'CSE', email: '', attendance: false }]);
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
      if (!formData.leadMobile) { alert("Enter lead mobile number"); return; }

      // Email Validation
      if (!formData.leadEmail.toLowerCase().endsWith("@klu.ac.in")) {
        alert("Please use your KLU email ID (@klu.ac.in) for the Team Lead.");
        return;
      }
      for (const m of teamMembers) {
        if (!m.email.toLowerCase().endsWith("@klu.ac.in")) {
          alert(`Please use KLU email ID (@klu.ac.in) for member: ${m.name || 'unnamed'}`);
          return;
        }
      }

      setRegStep(1);
    } else if (regStep === 1) {
      // Payment Step
      const totalAmount = calcPrice();
      // If amount > 0, validate payment stuff.
      if (totalAmount > 0) {
        if (!paymentProof) { alert("Please upload payment proof"); return; }
        if (!formData.transactionId) { alert("Please enter Transaction ID / UTR"); return; }
      }

      setIsSubmittingReg(true); // Set loading state
      const submitRegistration = async () => {
        try {
          console.log("Starting registration process...");
          let paymentProofUrl = '';
          if (paymentProof) {
            console.log("File size:", paymentProof.size);
            if (paymentProof.size > 10 * 1024 * 1024) {
              throw new Error("File too large. Max 10MB.");
            }
            console.log("Compressing payment proof...");
            const compressed = await compressImage(paymentProof, 1200); // Proof can be larger for detail
            console.log("Uploading to ImgBB...");
            paymentProofUrl = await uploadToImgBB(compressed, 'proof.jpg');
            console.log("Upload success:", paymentProofUrl);
          }

          const newRegData = {
            event_id: formData.eventId,
            team_name: formData.teamName,
            lead_email: formData.leadEmail,
            lead_mobile: formData.leadMobile,
            payment_status: totalAmount > 0 ? 'pending' : 'approved',
            payment_proof_url: paymentProofUrl,
            transaction_id: formData.transactionId || 'FREE',
            timestamp: new Date().toISOString(),
            team_members: teamMembers
          };

          console.log("Saving to Supabase...");
          const { data, error } = await supabase.from('registrations').insert([newRegData]).select();
          if (error) throw error;

          console.log("Supabase save success. ID:", data[0].id);

          const backMapped: Registration = {
            id: data[0].id,
            eventId: data[0].event_id,
            teamName: data[0].team_name,
            leadEmail: data[0].lead_email,
            leadMobile: data[0].lead_mobile,
            paymentStatus: data[0].payment_status,
            paymentProofUrl: data[0].payment_proof_url,
            transactionId: data[0].transaction_id,
            timestamp: data[0].timestamp,
            teamMembers: data[0].team_members
          };

          setLastRegisteredTeam(backMapped);
          setRegStep(2);

          // Clear persistence on success
          localStorage.removeItem('hms_form_data');
          localStorage.removeItem('hms_members');
        } catch (e: any) {
          console.error("Error registering:", e);
          alert("Registration failed: " + e.message);
        } finally {
          setIsSubmittingReg(false); // Reset loading state
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
    const headers = ['Team Name', 'Lead Email', 'Lead Mobile', 'Member Name', 'Reg No', 'Email', 'Year', 'Department'];
    const rows = team.teamMembers.map((m, index) => [
      index === 0 ? team.teamName : '',
      index === 0 ? team.leadEmail : '',
      index === 0 ? team.leadMobile : '',
      m.name, m.regNo, m.email, m.year, m.dept === 'others' ? (m.otherDept || 'Other') : m.dept
    ]);
    const csvContent = "data:text/csv;charset=utf-8," +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `${team.teamName}_data.csv`;
    link.click();
  };

  // --- Handlers: Admin Attendance ---
  const handleScan = async (result: any) => {
    if (result && result.length > 0) {
      const rawValue = result[0].rawValue;
      if (!rawValue) return;

      try {
        const { t: tid, m: mid } = JSON.parse(rawValue);

        // ALWAYS fetch the absolute latest record from Supabase to prevent overwriting other admin's changes
        const { data: latestReg, error: fetchError } = await supabase
          .from('registrations')
          .select('team_members')
          .eq('id', tid)
          .single();

        if (fetchError || !latestReg) { setScanResult("❌ Registration record not found"); return; }

        const currentMembers = latestReg.team_members as Member[];
        const memberIndex = currentMembers.findIndex(m => m.id === mid);

        if (memberIndex === -1) { setScanResult("❌ Member not found in this team"); return; }

        const member = currentMembers[memberIndex];
        if (member.attendance) {
          setScanResult(`⚠️ ${member.name} already marked present!`);
          return;
        }

        // Apply change to the list we just fetched
        const updatedMembers = [...currentMembers];
        updatedMembers[memberIndex] = { ...member, attendance: true };

        const { error: updateError } = await supabase
          .from('registrations')
          .update({ team_members: updatedMembers })
          .eq('id', tid);

        if (updateError) throw updateError;

        setScanResult(`✅ Marked PRESENT: ${member.name}`);

      } catch (err) {
        console.error(err);
        setScanResult("❌ Error scanning ticket");
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

  const handleTicketSearch = (e: FormEvent) => {
    e.preventDefault();
    const found = registrations.filter(r => r.leadEmail.toLowerCase() === ticketSearchEmail.toLowerCase());
    if (found.length === 0) {
      alert("No registrations found for this email.");
    }
    setFoundRegistrations(found);
  };

  const updatePaymentStatus = async (regId: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase.from('registrations').update({ payment_status: status }).eq('id', regId);
      if (error) throw error;
      alert(`Status updated to ${status}`);
    } catch (e) {
      console.error(e);
      alert("Failed to update status");
    }
  };

  // --- Handlers: Success & Downloads ---
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

    const headers = ['Team ID', 'Team Name', 'Lead Email', 'Lead Mobile', 'Transaction ID', 'Payment Proof URL', 'Member Name', 'Reg No', 'Email', 'Year', 'Department', 'Attendance', 'Payment Status', 'Timestamp'];
    const rows: string[][] = [];

    // Sort by Team Name
    const sortedRegs = [...eventRegs].sort((a, b) => a.teamName.localeCompare(b.teamName));

    sortedRegs.forEach(r => {
      r.teamMembers.forEach((m, index) => {
        // Only show team details for the FIRST member of the team (to simulate 'merged' look)
        const teamDetails = index === 0 ? [
          r.id,
          r.teamName,
          r.leadEmail,
          r.leadMobile || 'N/A',
          r.transactionId || 'N/A',
          r.paymentProofUrl || 'N/A'
        ] : ['', '', '', '', '', ''];

        const sharedDetails = index === 0 ? [
          r.paymentStatus,
          r.timestamp
        ] : ['', ''];

        rows.push([
          ...teamDetails,
          m.name,
          m.regNo,
          m.email,
          m.year,
          m.dept === 'others' ? (m.otherDept || 'Other') : m.dept,
          m.attendance ? 'PRESENT' : 'ABSENT',
          ...sharedDetails
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
    <div className="min-h-screen relative overflow-x-hidden text-amber-50">
      {/* Background Image with Overlay */}
      <div className="fixed inset-0 z-0">
        <img src={bgImage} alt="Avatar Background" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      </div>

      <nav className="relative z-10 border-b border-amber-500/30 bg-black/40 backdrop-blur-md sticky top-0">
        <div className="container mx-auto px-4 py-3 flex flex-wrap justify-between items-center">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-amber-500 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-xl md:text-2xl animate-pulse">⬇</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 drop-shadow-sm">HMS</h1>
          </div>

          {/* Mobile Menu Toggle (Simplified for this complexity, using wrap for now or simple stack) */}
          <div className="flex flex-wrap gap-2 mt-4 md:mt-0 justify-center w-full md:w-auto">
            {!isAdmin ? (
              <>
                <button onClick={() => setView('home')} className={`px-3 py-1 md:px-4 md:py-2 text-sm md:text-base hover:text-amber-300 ${view === 'home' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>Home</button>
                <button onClick={() => setView('events')} className={`px-3 py-1 md:px-4 md:py-2 text-sm md:text-base hover:text-amber-300 ${view === 'events' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>Events</button>
                <button onClick={() => { setView('register'); resetRegForm(); }} className={`px-3 py-1 md:px-4 md:py-2 text-sm md:text-base hover:text-amber-300 ${view === 'register' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>Register</button>
                <button onClick={() => { setView('my-tickets'); setFoundRegistrations([]); setTicketSearchEmail(''); }} className={`px-3 py-1 md:px-4 md:py-2 text-sm md:text-base hover:text-amber-300 ${view === 'my-tickets' ? 'text-amber-400 font-bold' : 'text-white/80'}`}>My Tickets</button>
                <button onClick={() => setView('login')} className="px-3 py-1 md:px-4 md:py-2 text-sm md:text-base bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all border border-white/20">Admin</button>
              </>
            ) : (
              <>
                <button onClick={() => setView('admin-dashboard')} className="px-3 py-1 md:px-4 md:py-2 text-sm md:text-base text-white hover:text-amber-300">Dashboard</button>
                <button onClick={() => { setEditingEventId(null); setNewEvent({ name: '', date: '', venue: '', pricePerPerson: '', pricePerTeam: '', pricingType: 'person', description: '', bankDetails: '', whatsappLink: '', maxMembers: 4, isOpen: true }); setView('admin-create'); }} className="px-3 py-1 md:px-4 md:py-2 text-sm md:text-base text-white hover:text-amber-300">Create</button>
                <button onClick={() => setView('admin-attendance')} className="px-3 py-1 md:px-4 md:py-2 text-sm md:text-base text-white hover:text-amber-300">Attendance</button>
                <button onClick={() => { setIsAdmin(false); setView('home'); }} className="px-3 py-1 md:px-4 md:py-2 text-sm md:text-base bg-red-600/80 text-white rounded-lg hover:bg-red-700">Logout</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="relative z-10 container mx-auto px-6 py-12">

        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="text-center py-10 md:py-20 px-4">
            <div className="backdrop-blur-md bg-black/40 rounded-3xl p-8 md:p-16 border border-amber-500/20 shadow-2xl shadow-black max-w-5xl mx-auto transform transition-transform duration-500">
              <h2 className="text-4xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600 mb-6 md:mb-8 font-avatar drop-shadow-lg">Welcome to HMS</h2>
              <p className="text-xl md:text-3xl text-amber-100/80 mb-8 md:mb-12 tracking-wide">Find events that you are interested in here.</p>
              <div className="flex flex-col md:flex-row justify-center gap-4 md:space-x-8">
                <button onClick={() => setView('events')} className="group relative px-6 py-3 md:px-8 md:py-4 bg-gradient-to-r from-amber-600 to-red-700 text-white rounded-xl text-lg md:text-xl font-bold shadow-lg shadow-orange-900/40 hover:from-amber-500 hover:to-red-600 transition-all">
                  <span className="relative z-10 flex items-center justify-center gap-2">View Events <Flame size={20} className="group-hover:animate-bounce" /></span>
                </button>
                <button onClick={() => { setView('register'); resetRegForm(); }} className="group px-6 py-3 md:px-8 md:py-4 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-xl text-lg md:text-xl font-bold shadow-lg shadow-blue-900/40 hover:from-cyan-500 hover:to-blue-600 transition-all">
                  <span className="flex items-center justify-center gap-2">Register Now <Droplets size={20} className="group-hover:animate-bounce" /></span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: MY TICKETS */}
        {view === 'my-tickets' && (
          <div className="max-w-4xl mx-auto">
            <div className="backdrop-blur-xl bg-black/50 rounded-2xl p-8 border border-amber-500/20 shadow-2xl">
              <h2 className="text-3xl font-bold text-amber-100 mb-6 text-center">Retrieve Your Tickets</h2>
              <form onSubmit={handleTicketSearch} className="flex gap-4 mb-10">
                <input
                  type="email"
                  placeholder="Enter lead email used during registration"
                  value={ticketSearchEmail}
                  onChange={e => setTicketSearchEmail(e.target.value)}
                  className="input-field flex-1"
                  required
                />
                <button type="submit" className="btn-primary whitespace-nowrap px-8">Search</button>
              </form>

              <div className="space-y-6">
                {foundRegistrations.map(r => {
                  const evt = events.find(e => e.id === r.eventId);
                  return (
                    <div key={r.id} className="bg-white/5 rounded-xl p-6 border border-white/10">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-amber-400">{evt?.name || 'Unknown Event'}</h3>
                          <p className="text-white/60">Team: {r.teamName}</p>
                          <p className={`text-sm font-bold mt-1 ${r.paymentStatus === 'approved' ? 'text-green-400' : r.paymentStatus === 'rejected' ? 'text-red-400' : 'text-yellow-400'}`}>
                            Status: {r.paymentStatus.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        {r.teamMembers.map(m => (
                          <div key={m.id} className="bg-black/30 p-4 rounded-lg flex justify-between items-center border border-white/5">
                            <div className="text-left">
                              <p className="font-bold text-white text-sm">{m.name}</p>
                              <p className="text-[10px] text-white/50">{m.regNo}</p>
                            </div>
                            {r.paymentStatus === 'approved' ? (
                              <button onClick={() => downloadTicket(m, r)} className="p-2 bg-white text-black rounded hover:bg-gray-200 flex items-center gap-1 text-[10px] font-bold">
                                <QrCode size={12} /> Ticket
                              </button>
                            ) : (
                              <span className="text-[10px] text-white/30 italic">Pending Approval</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW: EVENTS */}
        {view === 'events' && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold text-amber-100 mb-6 md:mb-10 border-b border-amber-500/30 pb-4 inline-block">Ongoing Events</h2>
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
                    <input type="email" value={formData.leadEmail} onChange={e => setFormData({ ...formData, leadEmail: e.target.value })} placeholder="Lead Email (@klu.ac.in)" className="input-field" required />
                    <input type="tel" value={formData.leadMobile} onChange={e => setFormData({ ...formData, leadMobile: e.target.value })} placeholder="Lead Mobile Number" className="input-field" required />
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input type="text" placeholder="Name" value={m.name} onChange={e => handleMemberChange(i, 'name', e.target.value)} className="input-sm" required />
                          <input type="text" placeholder="Reg No" value={m.regNo} onChange={e => handleMemberChange(i, 'regNo', e.target.value)} className="input-sm" required />
                          <input type="email" placeholder="KLU Email (@klu.ac.in)" value={m.email} onChange={e => handleMemberChange(i, 'email', e.target.value)} className="input-sm" required />

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-white/50 px-1 uppercase font-bold">Year</label>
                            <select value={m.year} onChange={e => handleMemberChange(i, 'year', e.target.value)} className="input-sm" required>
                              <option value="1st">1st Year</option>
                              <option value="2nd">2nd Year</option>
                              <option value="3rd">3rd Year</option>
                              <option value="4th">4th Year</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-white/50 px-1 uppercase font-bold">Dept</label>
                            <select value={m.dept} onChange={e => handleMemberChange(i, 'dept', e.target.value)} className="w-full input-sm" required>
                              <option value="CSE">CSE</option>
                              <option value="ECE">ECE</option>
                              <option value="IT">IT</option>
                              <option value="EEE">EEE</option>
                              <option value="Mech">Mech</option>
                              <option value="others">others(specify)</option>
                            </select>
                          </div>

                          {m.dept === 'others' && (
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[10px] text-amber-400 px-1 font-bold uppercase tracking-wider">Please specify department</label>
                              <input
                                type="text"
                                placeholder="Enter your department name"
                                value={m.otherDept || ''}
                                onChange={e => handleMemberChange(i, 'otherDept', e.target.value)}
                                className="w-full input-sm bg-amber-500/10 border-amber-500/30 text-amber-200"
                                required
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="submit" className="w-full btn-primary mt-4">Proceed to Payment <ArrowRight size={20} /></button>
                </form>
              )}

              {/* Paid Event Logic */}
              {regStep === 1 && currentEvent && calcPrice() > 0 && (
                <form onSubmit={nextStep} className="space-y-8">
                  <div className="bg-amber-500/10 rounded-xl p-6 border border-amber-500/20">
                    <h3 className="text-xl font-bold text-amber-400 mb-2">Payment Summary</h3>
                    <p className="text-white/80">Event: {currentEvent.name}</p>
                    <p className="text-white/80">Members: {teamMembers.length}</p>
                    <p className="text-3xl font-bold text-white mt-4">Total: ₹{calcPrice()}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="text-center">
                      <div className="bg-white p-4 rounded-xl inline-block max-w-full">
                        {currentEvent.paymentQRSrc ? (
                          <div className="flex flex-col items-center gap-4">
                            <h4 className="text-black font-bold text-lg">Scan QR to Pay</h4>
                            <img
                              src={currentEvent.paymentQRSrc}
                              alt="Pay QR"
                              className="w-48 h-48 object-contain"
                            />
                          </div>
                        ) : currentEvent.bankDetails ? (
                          <div className="text-left py-4 px-6 bg-gray-100 rounded-lg border-2 border-amber-500/20">
                            <h4 className="text-amber-700 font-black text-xl mb-4 italic uppercase flex items-center gap-2">
                              <CheckCircle size={20} /> Bank Details
                            </h4>
                            <div className="text-gray-800 font-bold whitespace-pre-wrap leading-relaxed text-sm">
                              {currentEvent.bankDetails}
                            </div>
                          </div>
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center text-gray-400 italic bg-gray-100 uppercase font-bold text-xs p-4 text-center">No payment method provided</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-white font-bold mb-4">Upload Proof</h4>
                      <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-amber-500/50 transition-colors">
                        <input type="file" id="proof" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files && setPaymentProof(e.target.files[0])} />
                        <label htmlFor="proof" className="cursor-pointer block">
                          <Upload size={40} className="mx-auto text-amber-500 mb-2" />
                          <p className="text-white/80">Click to select file</p>
                        </label>
                        {paymentProof && <p className="text-green-400 mt-2 text-sm">{paymentProof.name}</p>}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <h4 className="text-white font-bold mb-2">Transaction ID / UTR</h4>
                      <input
                        type="text"
                        placeholder="Enter Transaction ID (Required for verification)"
                        value={formData.transactionId}
                        onChange={e => setFormData({ ...formData, transactionId: e.target.value })}
                        className="input-field"
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={isSubmittingReg} className="w-full btn-primary mt-6 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmittingReg ? 'Processing Registration...' : 'Complete Registration'} <CheckCircle size={20} />
                  </button>
                </form>
              )}

              {/* FREE EVENT CHECK */}
              {regStep === 1 && currentEvent && calcPrice() === 0 && (
                <form onSubmit={nextStep} className="space-y-8">
                  <div className="bg-green-500/10 rounded-xl p-8 border border-green-500/30 text-center">
                    <h3 className="text-3xl font-bold text-green-400 mb-4">Free Event</h3>
                    <p className="text-white/80 text-xl mb-6">No payment is required for {currentEvent.name}.</p>
                    <p className="text-white/60">Click below to confirm your registration.</p>
                  </div>
                  <button type="submit" className="w-full btn-primary mt-6 from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500">Confirm Registration <CheckCircle size={20} /></button>
                </form>
              )}

              {regStep === 2 && lastRegisteredTeam && (
                <div className="text-center">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={40} className="text-green-400" />
                  </div>
                  <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-4 font-avatar">Congratulations mate...!</h2>
                  <p className="text-2xl text-white/90 mb-8 tracking-wide">Your team has been successfully registered for the <span className="text-amber-400 font-bold">"{events.find(e => e.id === lastRegisteredTeam.eventId)?.name}"</span></p>

                  <div className="flex justify-center gap-4 max-w-2xl mx-auto mb-8">

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
            <div className="flex justify-between items-center mb-10 border-b border-amber-500/30 pb-4">
              <h2 className="text-4xl font-bold text-white">Event Statistics</h2>
              <div className="flex gap-2">
                <button onClick={() => { }} className="px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-600/40 transition-all font-bold text-sm">Realtime Active</button>
              </div>
            </div>
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
                      {e.paymentQRSrc && (
                        <div className="mb-2 group relative">
                          <img src={e.paymentQRSrc} alt="QR Preview" className="w-12 h-12 rounded border border-white/20 object-contain bg-white p-0.5" />
                          <div className="absolute left-full ml-2 top-0 z-50 hidden group-hover:block backdrop-blur-md bg-white p-2 rounded-lg border border-amber-500/50 shadow-2xl">
                            <img src={e.paymentQRSrc} alt="Large" className="w-48 h-48 object-contain" />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => { setSelectedEventIdForRegs(e.id); setView('admin-registrations'); }}
                        className="px-6 py-2 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-xl hover:bg-purple-600/40 transition-all font-bold flex items-center gap-2"
                      >
                        Registrations
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => startEditEvent(e)}
                          className="px-6 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-600/40 transition-all font-bold flex items-center gap-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleEventStatus(e.id, e.isOpen)}
                          className={`px-6 py-2 rounded-xl font-bold transition-all border ${e.isOpen ? 'bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/40' : 'bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/40'}`}
                        >
                          {e.isOpen ? 'Close' : 'Open'}
                        </button>
                        <button
                          onClick={() => deleteEvent(e.id)}
                          className="px-6 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-600/40 transition-all font-bold flex items-center gap-2"
                        >
                          <X size={18} />
                        </button>
                        <button
                          onClick={() => downloadEventData(e)}
                          className="px-4 py-2 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl hover:bg-blue-600/40 transition-all font-bold flex items-center gap-2 text-sm"
                        >
                          <Download size={16} />
                          <span>Data ({registrations.filter(r => r.eventId === e.id).length})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && <p className="text-center text-white/50 text-xl py-10">No events created yet.</p>}
            </div>
          </div>
        )}

        {/* VIEW: ADMIN REGISTRATIONS LIST */}
        {view === 'admin-registrations' && isAdmin && (
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white">
                Teams for {events.find(e => e.id === selectedEventIdForRegs)?.name}
              </h2>
              <button onClick={() => setView('admin-events')} className="text-amber-400 hover:underline">← Back to Stats</button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {registrations.filter(r => r.eventId === selectedEventIdForRegs).map(r => (
                <div key={r.id} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-amber-400">{r.teamName}</h3>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${r.paymentStatus === 'approved' ? 'bg-green-500/20 text-green-400' : r.paymentStatus === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {r.paymentStatus.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-white/60 text-sm">Lead: {r.leadEmail} | Tx ID: {r.transactionId}</p>
                      <p className="text-white/40 text-[10px] mt-1">ID: {r.id}</p>
                    </div>

                    <div className="flex gap-2 items-center">
                      {r.paymentProofUrl && (
                        <a href={r.paymentProofUrl} target="_blank" className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs hover:bg-blue-600/40" rel="noreferrer">View Proof</a>
                      )}
                      <button onClick={() => updatePaymentStatus(r.id, 'approved')} className="p-2 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-600/40">Approve</button>
                      <button onClick={() => updatePaymentStatus(r.id, 'rejected')} className="p-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-600/40">Reject</button>
                      <button onClick={() => downloadTeamCSV(r)} className="p-2 bg-white/10 text-white border border-white/20 rounded-lg text-xs">CSV Data</button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 border-t border-white/10 pt-4">
                    {r.teamMembers.map(m => (
                      <div key={m.id} className="bg-black/20 p-2 rounded flex justify-between items-center text-xs">
                        <span>{m.name} ({m.regNo})</span>
                        {m.attendance && <span className="text-green-500 font-bold">✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {registrations.filter(r => r.eventId === selectedEventIdForRegs).length === 0 && (
                <p className="text-center text-white/50 py-10">No registrations for this event.</p>
              )}
            </div>
          </div>
        )}


        {/* VIEW: ADMIN CREATE EVENT (EXISTING) */}
        {view === 'admin-create' && isAdmin && (
          <div className="max-w-2xl mx-auto backdrop-blur-xl bg-black/50 rounded-2xl p-10 border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-6">{editingEventId ? 'Edit Event' : 'Create New Event'}</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Event Name" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} className="input-field" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="date" value={newEvent.date ? new Date(newEvent.date).toISOString().split('T')[0] : ''} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className="input-field" />
                <input type="text" placeholder="Venue" value={newEvent.venue} onChange={e => setNewEvent({ ...newEvent, venue: e.target.value })} className="input-field" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Max Team Size</label>
                  <input type="number" value={newEvent.maxMembers} onChange={e => setNewEvent({ ...newEvent, maxMembers: parseInt(e.target.value) })} className="input-field" />
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10 mb-auto mt-auto h-[52px]">
                  <input
                    type="checkbox"
                    id="paymentToggle"
                    checked={isPaymentEnabled}
                    onChange={e => setIsPaymentEnabled(e.target.checked)}
                    className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                  />
                  <label htmlFor="paymentToggle" className="text-white font-bold cursor-pointer select-none text-sm">Enable Payment?</label>
                </div>
              </div>

              {isPaymentEnabled && (
                <div className="space-y-4 border-l-2 border-amber-500/30 pl-4 my-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-white/50 block mb-1">Pricing Helper</label>
                      <select value={newEvent.pricingType} onChange={e => setNewEvent({ ...newEvent, pricingType: e.target.value as any })} className="input-field">
                        <option value="person" className="bg-gray-900">Per Person</option>
                        <option value="team" className="bg-gray-900">Per Team</option>
                      </select>
                    </div>
                    <div>
                      {newEvent.pricingType === 'person' ? (
                        <>
                          <label className="text-xs text-white/50 block mb-1">Price (Per Person)</label>
                          <input type="number" placeholder="₹" value={newEvent.pricePerPerson} onChange={e => setNewEvent({ ...newEvent, pricePerPerson: e.target.value })} className="input-field" />
                        </>
                      ) : (
                        <>
                          <label className="text-xs text-white/50 block mb-1">Price (Per Team)</label>
                          <input type="number" placeholder="₹" value={newEvent.pricePerTeam} onChange={e => setNewEvent({ ...newEvent, pricePerTeam: e.target.value })} className="input-field" />
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 p-1 bg-white/10 rounded-lg mb-4">
                    <button
                      type="button"
                      onClick={() => setPaymentChoice('qr')}
                      className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${paymentChoice === 'qr' ? 'bg-amber-500 text-black shadow-lg' : 'text-white/60 hover:text-white'}`}
                    >
                      QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentChoice('bank')}
                      className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${paymentChoice === 'bank' ? 'bg-amber-500 text-black shadow-lg' : 'text-white/60 hover:text-white'}`}
                    >
                      Bank Details
                    </button>
                  </div>

                  {paymentChoice === 'bank' && (
                    <textarea
                      placeholder="Enter Bank Details (Acc No, IFSC, Name, etc.)"
                      value={newEvent.bankDetails}
                      onChange={e => setNewEvent({ ...newEvent, bankDetails: e.target.value })}
                      className="input-field"
                      rows={3}
                    />
                  )}

                  {paymentChoice === 'qr' && (
                    <div className="border border-white/20 p-4 rounded-lg">
                      <label className="block text-white mb-2 text-sm font-bold">Upload Payment QR Image</label>
                      {adminQrFile ? (
                        <div className="mb-4 text-center">
                          <p className="text-[10px] text-green-400 mb-2 uppercase font-bold">Selected Preview:</p>
                          <img src={URL.createObjectURL(adminQrFile)} alt="Selected QR" className="w-32 h-32 mx-auto object-contain bg-white p-2 rounded border-2 border-green-500" />
                        </div>
                      ) : editingEventId && events.find(e => e.id === editingEventId)?.paymentQRSrc && (
                        <div className="mb-4 text-center">
                          <p className="text-[10px] text-amber-400 mb-2 uppercase font-bold">Current QR:</p>
                          <img src={events.find(e => e.id === editingEventId)?.paymentQRSrc} alt="Current QR" className="w-32 h-32 mx-auto object-contain bg-white p-2 rounded border-2 border-white/20" />
                        </div>
                      )}
                      <input type="file" accept="image/*" onChange={handleAdminQrUpload} className="text-white/70 text-xs" />
                    </div>
                  )}
                </div>
              )}

              {!isPaymentEnabled && (
                <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-lg">
                  <p className="text-green-400 font-bold text-center">This will be a FREE event.</p>
                </div>
              )}

              <input type="text" placeholder="WhatsApp Link (Recommended)" value={newEvent.whatsappLink} onChange={e => setNewEvent({ ...newEvent, whatsappLink: e.target.value })} className="input-field" />
              <textarea placeholder="Description" value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className="input-field" rows={3} />

              <div className="flex gap-4">
                <button onClick={saveEvent} disabled={isSubmitting} className="btn-primary flex-1 mt-4 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? (editingEventId ? 'Updating...' : 'Creating...') : (editingEventId ? 'Update Event' : 'Create Event')}
                </button>
                {editingEventId && (
                  <button onClick={() => { setEditingEventId(null); setView('admin-dashboard'); }} className="mt-4 px-6 py-2 bg-white/10 text-white rounded-xl">Cancel</button>
                )}
              </div>
            </div>
          </div>
        )}    {/* VIEW: ADMIN ATTENDANCE */}
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


    </div >
  );
}