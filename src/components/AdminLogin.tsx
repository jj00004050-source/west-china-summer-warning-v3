import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { adminLogin } from '../utils/api'

export default function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await adminLogin(password); onSuccess() } catch (x) { setError(x instanceof Error ? x.message : '登录失败') } }
  return <div className="admin-login"><form onSubmit={submit}><div className="login-icon"><LockKeyhole/></div><h1>管理员数据后台</h1><p>上传、覆盖和删除操作均由服务端鉴权保护</p><label>管理员密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus/></label>{error && <span className="login-error">{error}</span>}<button>安全登录</button><a href="/dashboard">返回只读看板</a></form></div>
}
