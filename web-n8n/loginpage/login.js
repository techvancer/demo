import { supabase } from "../supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");

  if (!emailEl || !passEl || !loginBtn) {
    console.error("Login page elements not found (email/password/loginBtn).");
    return;
  }

  loginBtn.addEventListener("click", async () => {
    const email = (emailEl.value || "").trim();
    const password = passEl.value || "";

    if (!email || !password) {
      alert("Please enter email and password");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert("Login failed: " + error.message);
        console.error(error);
        return;
      }

      console.log("Login success:", data);
      window.location.href = "../homepage/index.html";
    } finally {
      // إذا صار خطأ أو ما صار، رجّع الزر (لكن لو نجح رح ينتقل للصفحة)
      loginBtn.disabled = false;
      loginBtn.textContent = "Login";
    }
  });
});
