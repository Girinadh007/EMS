# EMS - Event Management System 🚀

A robust, real-time Event Management System designed for college campus events. EMS provides a seamless experience for students to discover and register for events, while offering a powerful dashboard for administrators to manage everything from event creation to attendance tracking and payment verification.

![EMS Preview](https://img.icons8.com/clouds/100/000000/calendar.png)


Live project link - https://ems-rmwn.onrender.com/

Used render to host the website, supabase for back-end and imagebb for image gathering(proof of payment).

## ✨ Features

### 👨‍🎓 For Students
- **Event Discovery**: Browse upcoming and ongoing events with real-time updates.
- **Multi-Step Registration**: Simple and intuitive registration process for individuals or teams.
- **Secure Payments**: Upload and manage payment proofs directly within the portal.
- **Digital Tickets**: Search for and download QR-code-based tickets after admin approval.
- **Instant Access**: Quick links to WhatsApp groups and event details.

### 🔐 For Administrators
- **Dynamic Event Management**: Create, edit, and toggle event visibility.
- **Payment Verification**: Dedicated portal to approve or reject registrations based on payment proofs.
- **QR Ticket Scanning**: Built-in QR scanner for effortless attendance tracking.
- **Comprehensive Analytics**: Real-time stats on registrations and revenue for each event.
- **Data Export**: Export registration data as CSV or download team details in ZIP format.
- **Image Handling**: Automatic image compression and hosting integration.

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend & Real-time**: [Supabase](https://supabase.com/) (PostgreSQL & Real-time Subscriptions)
- **Icons**: [Lucide React](https://lucide.dev/)
- **QR Codes**: `qrcode` & `@yudiel/react-qr-scanner`
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Image Hosting**: [ImgBB API](https://imgbb.com/)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Girinadh007/EMS.git
   cd EMS
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```text
EMS/
├── src/
│   ├── assets/       # Static assets & images
│   ├── lib/          # Database clients (Supabase/Firebase)
│   ├── App.tsx       # Main application logic & UI
│   ├── main.tsx      # Entry point
│   └── index.css     # Global styles (Tailwind)
├── public/           # Public assets
├── .env.example      # Example environment variables
└── tailwind.config.js # Tailwind configuration
```

## ⚙️ Configuration

- **Database**: The project uses Supabase. Ensure you have `events` and `registrations` tables set up in your Supabase project.
- **Admin Access**: Admin features can be accessed by entering the admin portal with the predefined password.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---


