'use client'

export default function LoginForm() {
  return (
    <form 
      className="flex flex-col gap-4 w-full max-w-sm p-6 bg-white rounded-lg shadow"
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: formData.get('email'),
              password: formData.get('password'),
            }),
          });
          const data = await response.json();
          if (response.ok) {
            alert('Login successful!');
            // Handle successful login here (e.g., store token, redirect)
          } else {
            alert(data.error || 'Login failed');
          }
        } catch (error) {
          alert('An error occurred during login');
        }
      }}
    >
      <h2 className="text-2xl font-bold mb-4">Login</h2>
      <input
        type="email"
        name="email"
        placeholder="Email"
        className="p-2 border rounded"
        required
      />
      <input
        type="password"
        name="password"
        placeholder="Password"
        className="p-2 border rounded"
        required
      />
      <button
        type="submit"
        className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        Sign In
      </button>
    </form>
  )
}