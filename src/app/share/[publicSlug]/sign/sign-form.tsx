"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signContract } from "../../actions"

export default function SignForm({ publicSlug }: { publicSlug: string }) {
  const router = useRouter()
  const [method, setMethod] = useState<"typed" | "drawn">("typed")
  const [typedName, setTypedName] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const point = "touches" in e ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    drawing.current = true
    hasDrawn.current = true
    const ctx = canvas.getContext("2d")
    const { x, y } = getPos(e, canvas)
    ctx?.beginPath()
    ctx?.moveTo(x, y)
  }
  function moveDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#111"
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function endDraw() {
    drawing.current = false
  }
  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
    hasDrawn.current = false
  }

  async function handleSign() {
    setError(null)
    if (!agreed) {
      setError("Check the box to confirm you agree before signing.")
      return
    }
    setBusy(true)
    try {
      if (method === "typed") {
        await signContract(publicSlug, { method: "typed", typedName })
      } else {
        if (!hasDrawn.current) throw new Error("Draw your signature first.")
        const dataUrl = canvasRef.current?.toDataURL("image/png")
        await signContract(publicSlug, { method: "drawn", drawnDataUrl: dataUrl })
      }
      router.push(`/share/${publicSlug}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign")
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign this agreement</CardTitle>
        <CardDescription>This records your name (or drawn signature), the time, and a fingerprint of exactly this document text.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" variant={method === "typed" ? "default" : "outline"} size="sm" onClick={() => setMethod("typed")}>
            Type my name
          </Button>
          <Button type="button" variant={method === "drawn" ? "default" : "outline"} size="sm" onClick={() => setMethod("drawn")}>
            Draw signature
          </Button>
        </div>

        {method === "typed" ? (
          <div className="space-y-2">
            <Label>Full legal name</Label>
            <Input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Your full name"
              className="font-serif italic text-lg"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Draw below</Label>
            <canvas
              ref={canvasRef}
              width={600}
              height={150}
              className="border rounded-lg w-full touch-none bg-white"
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
            />
            <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>Clear</Button>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
          <span>I have read this agreement and agree to be bound by its terms.</span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSign} disabled={busy} className="w-full">
          {busy ? "Signing..." : "Sign & Submit"}
        </Button>
      </CardContent>
    </Card>
  )
}
