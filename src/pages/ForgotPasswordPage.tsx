import React from "react";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { TrendingUp, ArrowLeft } from "lucide-react";

const ForgotPasswordPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
            <p className="text-sm text-muted-foreground">Not available in local dev mode</p>
          </div>
        </div>

        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            Password reset via email isn't available in local dev mode, since there's no email service configured.
            If you know your current password, log in and use Change Password on your dashboard instead.
          </p>
          <Link to="/login" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
